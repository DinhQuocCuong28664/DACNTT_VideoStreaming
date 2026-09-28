#!/usr/bin/env python3
"""
Dựng input cho `aws batch register-job-definition` từ các revision hiện có,
chỉ đổi image của transcoder.

Cách dùng (trong workflow CI/CD):
    aws batch describe-job-definitions --job-definition-name NAME --status ACTIVE \
        --query 'jobDefinitions' --output json \
      | python3 scripts/next-job-definition.py IMAGE > jobdef.json
    aws batch register-job-definition --cli-input-json file://jobdef.json

Vì sao không chép thẳng một revision:
- `describe-job-definitions` không bảo đảm thứ tự, nên lấy phần tử đầu tiên có
  thể ra một revision cũ; ở đây luôn lấy revision có số lớn nhất.
- Bản jq trước trong ci-transcoder.yml chỉ chép 4 trường, làm mất
  retryStrategy và timeout mà Terraform đặt (modules/batch/main.tf). Kiểm tra
  ngày 2026-09-29: revision 14 (Terraform) có retry 3 / timeout 7200, revision
  15 và 16 (CI) không có cả hai — và Lambda luôn nộp job vào revision mới nhất.
  Script lấy hai trường này từ revision gần nhất còn có chúng, nên lần deploy
  sau tự khôi phục thay vì chép tiếp chỗ thiếu.

Không có revision ACTIVE nào thì thoát mã 2 để workflow báo lỗi rõ ràng.
"""

import json
import sys


def next_job_definition(revisions, image):
    if not revisions:
        raise LookupError("no ACTIVE revision")

    ordered = sorted(revisions, key=lambda r: r["revision"])
    latest = ordered[-1]

    def latest_with(field):
        for rev in reversed(ordered):
            if rev.get(field):
                return rev[field]
        return None

    container = dict(latest["containerProperties"])
    container["image"] = image

    result = {
        "jobDefinitionName": latest["jobDefinitionName"],
        "type": latest["type"],
        "platformCapabilities": latest.get("platformCapabilities", []),
        "containerProperties": container,
    }
    for field in ("retryStrategy", "timeout"):
        value = latest_with(field)
        if value:
            result[field] = value
    return result


def main():
    if len(sys.argv) != 2:
        print("usage: next-job-definition.py IMAGE < describe-output.json", file=sys.stderr)
        return 64
    try:
        payload = next_job_definition(json.load(sys.stdin), sys.argv[1])
    except LookupError:
        print("no ACTIVE job definition revision found", file=sys.stderr)
        return 2
    json.dump(payload, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())
