# -*- coding: utf-8 -*-
import sys
import json
import boto3

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

client = boto3.client("lambda", region_name="ap-southeast-1")

payload = {
    "version": "2.0",
    "routeKey": "GET /health",
    "rawPath": "/health",
    "rawQueryString": "",
    "headers": {
        "host": "b7ssxm6vbhvfdcaxsdn7vmosgy0thkbw.lambda-url.ap-southeast-1.on.aws",
        "accept": "*/*"
    },
    "requestContext": {
        "http": {
            "method": "GET",
            "path": "/health",
            "protocol": "HTTP/1.1",
            "sourceIp": "127.0.0.1",
            "userAgent": "curl"
        }
    }
}

response = client.invoke(
    FunctionName="dacntt-dev-backend-api",
    InvocationType="RequestResponse",
    Payload=json.dumps(payload).encode("utf-8")
)

res_payload = response["Payload"].read().decode("utf-8")
print("Response status code:", response["StatusCode"])
print("Response payload:", res_payload)
