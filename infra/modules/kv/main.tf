# DynamoDB on-demand tables for hot key-value data (ADR-17). They keep frequent small writes
# off the MongoDB free cluster, which throttles above 100 operations per second.
#
#   rate_limits     pk = "<scope>#<key>#<window start>"           TTL at window end
#   view_marks      pk = "<viewerKey>#<videoId>"                   TTL at the end of the view window
#   watch_progress  pk = userId, sk = videoId; GSI by_recent (pk userId, sk updatedAt) for history
#   heartbeats      pk = "<hour>" (UTC, e.g. 2026-10-30T13), sk = videoId; TTL a week after roll-up
#   notifications   pk = userId, sk = "<createdAt>#<id>"           TTL 90 days

locals {
  simple = {
    rate_limits = "pk"
    view_marks  = "pk"
  }
}

resource "aws_dynamodb_table" "simple" {
  for_each     = local.simple
  name         = "${var.name}-${replace(each.key, "_", "-")}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = each.value

  attribute {
    name = each.value
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = false # disposable data
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_dynamodb_table" "watch_progress" {
  name         = "${var.name}-watch-progress"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "videoId"

  attribute {
    name = "userId"
    type = "S"
  }
  attribute {
    name = "videoId"
    type = "S"
  }
  attribute {
    name = "updatedAt"
    type = "S"
  }

  global_secondary_index {
    name            = "by_recent"
    hash_key        = "userId"
    range_key       = "updatedAt"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_dynamodb_table" "heartbeats" {
  name         = "${var.name}-heartbeats"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "hour"
  range_key    = "videoId"

  attribute {
    name = "hour"
    type = "S"
  }
  attribute {
    name = "videoId"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = false
  }

  server_side_encryption {
    enabled = true
  }
}

resource "aws_dynamodb_table" "notifications" {
  name         = "${var.name}-notifications"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "sk"

  attribute {
    name = "userId"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery
  }

  server_side_encryption {
    enabled = true
  }
}
