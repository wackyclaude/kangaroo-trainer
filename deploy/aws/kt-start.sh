#!/usr/bin/env bash
# Starts Kangaroo Trainer on the AWS server: reads the settings from Parameter Store,
# copies the question bank from S3, writes .env and starts the containers. Runs on every boot.
set -euo pipefail
. /srv/kt/app/deploy/aws/env.sh
APP=/srv/kt/app
param() { aws ssm get-parameter --name "/kangaroo/$1" --with-decryption --query Parameter.Value --output text; }

HOST=$(param hostname)
SECRET=$(param origin-secret)
BUCKET=$(param content-bucket)

aws s3 sync "s3://$BUCKET/content/" /srv/kt/content/ --delete --only-show-errors

cd "$APP"
umask 077
cat > .env <<ENV
KT_HOSTNAME=$HOST
KT_ORIGIN_SECRET=$SECRET
KT_CONTENT_DIR=/srv/kt/content
KT_DATA_DIR=/srv/kt/data
KT_BACKUP_DIR=/srv/kt/backups
ENV
docker compose -f docker-compose.yml -f docker-compose.aws.yml up -d --build --remove-orphans
