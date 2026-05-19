# Inbound WhatsApp Onboarding 


A modern passwordless authentication system using WhatsApp, QR codes, Redis, and Server-Sent Events (SSE).

Users scan a QR code, send a WhatsApp verification message, and get authenticated instantly — without OTP typing.

## Features

WhatsApp QR Verification

Passwordless Authentication

Real-time SSE Verification

IP Rate Limiting

Secure Session Validation

Cross-device Login Flow


## Architecture

```
Frontend
   ↓
Create Verification Session
   ↓
Redis Session Store
   ↓
Generate QR
   ↓
User Scans QR
   ↓
WhatsApp Opens
   ↓
User Sends Verification Message
   ↓
WhatsApp Webhook
   ↓
Backend Validation
   ↓
SSE Push Event
   ↓
Frontend Login Success
```

## Tech Stack

Java 17

Spring Boot

Redis

SSE (Server-Sent Events)

WhatsApp Cloud API

Base64 Session Payload

Maven

