aws cloudformation package \
    --template-file ./rdpslack.yaml \
    --output-template-file serverless-output.yaml \
    --s3-bucket sci-rdpslack

aws cloudformation deploy \
    --template-file serverless-output.yaml \
    --stack-name sci-rdpslack \
    --capabilities CAPABILITY_IAM

say "Complete"
