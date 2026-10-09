terraform {
  required_version = ">= 1.13, < 2"
  required_providers {
    docker = {
      source  = "kreuzwerker/docker"
      version = "= 3.6.2"
    }
  }
}
provider "docker" {
  host = "unix:///var/run/docker.sock"
}
variable "environment_id" {
  type = string
  validation {
    condition     = can(regex("^kth-devops-it-[a-z0-9-]{1,40}$", var.environment_id))
    error_message = "Use a unique disposable kth-devops-it- environment."
  }
}
variable "runtime_dir" { type = string }
variable "frontend_image" { type = string }
variable "broker_image" { type = string }
variable "simulator_image" { type = string }
variable "guest_password" {
  type      = string
  sensitive = true
}
variable "operator_password" {
  type      = string
  sensitive = true
}
variable "simulator_password" {
  type      = string
  sensitive = true
}
variable "probe_password" {
  type      = string
  sensitive = true
}
resource "docker_network" "lab" {
  name     = "${var.environment_id}-network"
  internal = true
  labels {
    label = "kth.devops.environment"
    value = var.environment_id
  }
}
resource "docker_container" "broker" {
  name  = "${var.environment_id}-broker"
  image = var.broker_image
  env = [
    "BROKER_GUEST_PASSWORD=${var.guest_password}",
    "BROKER_OPERATOR_PASSWORD=${var.operator_password}",
    "BROKER_SIMULATOR_PASSWORD=${var.simulator_password}",
    "BROKER_PROBE_PASSWORD=${var.probe_password}",
  ]
  labels {
    label = "kth.devops.environment"
    value = var.environment_id
  }
  networks_advanced {
    name    = docker_network.lab.name
    aliases = ["broker"]
  }
  dynamic "upload" {
    for_each = {
      "mosquitto.conf" = "/mosquitto/config/mosquitto.conf"
      "acl"           = "/mosquitto/config/acl"
      "ca.crt"        = "/mosquitto/config/ca.crt"
      "broker.crt"    = "/mosquitto/config/broker.crt"
      "broker.key"    = "/mosquitto/config/broker.key"
    }
    content {
      file        = upload.value
      content     = file("${var.runtime_dir}/${upload.key}")
      permissions = "0644"
    }
  }
  wait         = true
  wait_timeout = 90
}
resource "docker_container" "frontend" {
  name  = "${var.environment_id}-frontend"
  image = var.frontend_image
  env   = ["MQTT_BROKER_URL=wss://broker:9001/mqtt", "DATA_TIMEOUT_MS=2000"]
  labels {
    label = "kth.devops.environment"
    value = var.environment_id
  }
  networks_advanced {
    name    = docker_network.lab.name
    aliases = ["frontend"]
  }
  wait         = true
  wait_timeout = 90
}
resource "docker_container" "simulator" {
  name       = "${var.environment_id}-simulator"
  image      = var.simulator_image
  depends_on = [docker_container.broker]
  env = [
    "MQTT_URL=mqtt://broker:1883",
    "MQTT_USERNAME=simulator",
    "MQTT_PASSWORD=${var.simulator_password}",
    "MQTT_CLIENT_ID=${var.environment_id}-publisher",
    "TELEMETRY_HZ_MS=500",
  ]
  labels {
    label = "kth.devops.environment"
    value = var.environment_id
  }
  networks_advanced {
    name = docker_network.lab.name
  }
}
