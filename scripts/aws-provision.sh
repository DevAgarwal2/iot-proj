#!/usr/bin/env bash
# Provision the Lecture Notes app on AWS (the path used in this repo's lab,
# where iam:CreateRole is denied so SST cannot be used).
#
# Usage:
#   MISTRAL_API_KEY=sk-... DB_PASSWORD=... ./scripts/aws-provision.sh
#
# Creates: S3 (audio), Secrets Manager (Mistral key + DB URL), RDS Postgres,
# SQS queue, ECR repo, an EC2 host (LabInstanceProfile) running the container,
# and an SQS-triggered Lambda worker.
set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="lecture-notes-audio-${ACCOUNT}-${REGION}"
DB_PASS="${DB_PASSWORD:?set DB_PASSWORD}"
MISTRAL_KEY="${MISTRAL_API_KEY:?set MISTRAL_API_KEY}"
MY_IP="$(curl -s https://checkip.amazonaws.com)"

echo "account=$ACCOUNT region=$REGION ip=$MY_IP"

# --- Secrets ---
aws secretsmanager create-secret --name lecture-notes/mistral-api-key \
  --secret-string "{\"MISTRAL_API_KEY\":\"$MISTRAL_KEY\"}" --region "$REGION" >/dev/null || true

# --- S3 ---
aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION" >/dev/null || true

# --- RDS (default VPC) ---
VPC="$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text)"
SUBNETS="$(aws ec2 describe-subnets --filters Name=default-for-az,Values=true Name=vpc-id,Values="$VPC" --query 'Subnets[].SubnetId' --output text)"
aws rds create-db-subnet-group --db-subnet-group-name lecture-notes-db-subnets \
  --db-subnet-group-description "lecture notes" --subnet-ids $SUBNETS --region "$REGION" >/dev/null 2>&1 || true

SG_DB="$(aws ec2 create-security-group --group-name lecture-notes-db-sg \
  --description "RDS access" --vpc-id "$VPC" --region "$REGION" --query GroupId --output text)"
aws ec2 authorize-security-group-ingress --group-id "$SG_DB" --protocol tcp --port 5432 --cidr "${MY_IP}/32" --region "$REGION" || true
aws ec2 authorize-security-group-ingress --group-id "$SG_DB" --protocol tcp --port 5432 --cidr "172.31.0.0/16" --region "$REGION" || true

aws rds create-db-instance --db-instance-identifier lecture-notes-db \
  --db-instance-class db.t4g.micro --engine postgres --master-username lecture \
  --master-user-password "$DB_PASS" --allocated-storage 20 --storage-type gp3 \
  --db-name lecturenotes --vpc-security-group-ids "$SG_DB" \
  --db-subnet-group-name lecture-notes-db-subnets --publicly-accessible \
  --backup-retention-period 0 --no-multi-az --region "$REGION" >/dev/null
echo "waiting for RDS..."
aws rds wait db-instance-available --db-instance-identifier lecture-notes-db --region "$REGION"
DB_HOST="$(aws rds describe-db-instances --db-instance-identifier lecture-notes-db --query 'DBInstances[0].Endpoint.Address' --output text --region "$REGION")"
DB_URL="postgresql://lecture:${DB_PASS}@${DB_HOST}:5432/lecturenotes?sslmode=no-verify"
aws secretsmanager create-secret --name lecture-notes/database-url \
  --secret-string "{\"DATABASE_URL\":\"$DB_URL\"}" --region "$REGION" >/dev/null || true

# --- SQS ---
QURL="$(aws sqs create-queue --queue-name lecture-notes-processing --region "$REGION" --query QueueUrl --output text)"
aws sqs set-queue-attributes --queue-url "$QURL" --attributes VisibilityTimeout=300 --region "$REGION"

# --- ECR + image ---
ECR="${ACCOUNT}.dkr.ecr.${REGION}.amazonaws.com/lecture-notes"
aws ecr create-repository --repository-name lecture-notes --region "$REGION" >/dev/null 2>&1 || true
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "${ECR%%/*}"
docker build -t lecture-notes -t "${ECR}:latest" .
docker push "${ECR}:latest"

# --- EC2 host (LabInstanceProfile) ---
AMI="$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 --query Parameter.Value --output text --region "$REGION")"
SG_APP="$(aws ec2 create-security-group --group-name lecture-notes-app-sg \
  --description "app" --vpc-id "$VPC" --region "$REGION" --query GroupId --output text)"
aws ec2 authorize-security-group-ingress --group-id "$SG_APP" --protocol tcp --port 80 --cidr 0.0.0.0/0 --region "$REGION" || true

cat > /tmp/userdata.sh <<EOF
#!/bin/bash
set -euxo pipefail
dnf install -y docker
systemctl enable --now docker
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin $ACCOUNT.dkr.ecr.$REGION.amazonaws.com
docker run -d --restart always -p 80:3000 \
  -e NODE_ENV=production -e AWS_REGION=$REGION -e AUDIO_BUCKET=$BUCKET \
  -e MISTRAL_SECRET_ARN=arn:aws:secretsmanager:$REGION:$ACCOUNT:secret:lecture-notes/mistral-api-key \
  -e DATABASE_URL='$DB_URL' --name lecture-notes ${ECR}:latest
EOF

IID="$(aws ec2 run-instances --image-id "$AMI" --instance-type t4g.small \
  --iam-instance-profile Name=LabInstanceProfile --security-group-ids "$SG_APP" \
  --user-data file:///tmp/userdata.sh --count 1 --region "$REGION" \
  --query 'Instances[0].InstanceId' --output text)"
aws ec2 wait instance-running --instance-ids "$IID" --region "$REGION"
APP_IP="$(aws ec2 describe-instances --instance-ids "$IID" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text --region "$REGION")"
echo "app running at http://$APP_IP"

# --- Lambda worker + SQS trigger ---
(cd lambda/process-audio && zip -q /tmp/process-audio.zip index.mjs)
PROCESS_SECRET="$(openssl rand -hex 16)"
aws lambda create-function --function-name lecture-notes-process \
  --runtime nodejs20.x --role "arn:aws:iam::${ACCOUNT}:role/LabRole" \
  --handler index.handler --zip-file fileb:///tmp/process-audio.zip \
  --timeout 120 --memory-size 256 \
  --environment "Variables={APP_BASE_URL=http://$APP_IP,PROCESS_SECRET=$PROCESS_SECRET}" \
  --region "$REGION" >/dev/null
QARN="$(aws sqs get-queue-attributes --queue-url "$QURL" --attribute-names QueueArn --query Attributes.QueueArn --output text --region "$REGION")"
aws lambda create-event-source-mapping --function-name lecture-notes-process \
  --event-source-arn "$QARN" --batch-size 1 --region "$REGION" >/dev/null

echo "done. app=http://$APP_IP"
