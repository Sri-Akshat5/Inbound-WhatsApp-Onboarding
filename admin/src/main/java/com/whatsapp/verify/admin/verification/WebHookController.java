package com.whatsapp.verify.admin.verification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequestMapping("/webhook")
@RequiredArgsConstructor
public class WebHookController {

    private static final String VERIFY_TOKEN =
            "test123";

    private final VerifyService verifyService;

    private final ObjectMapper mapper =
            new ObjectMapper();



    @GetMapping("/whatsapp")
    public String verifyWebhook(

            @RequestParam("hub.mode")
            String mode,

            @RequestParam("hub.verify_token")
            String token,

            @RequestParam("hub.challenge")
            String challenge
    ) {

        log.info("Webhook Verify Request Received");

        log.info("Mode: {}", mode);

        log.info("Token: {}", token);

        log.info("Challenge: {}", challenge);

        if (
                "subscribe".equals(mode)
                        &&
                        VERIFY_TOKEN.equals(token)
        ) {

            log.info("Webhook Verification Success");

            return challenge;
        }

        log.error("Webhook Verification Failed");

        return "Verification failed";
    }


    @PostMapping("/whatsapp")
    public ResponseEntity<?> receiveMessage(
            @RequestBody String payload
    ) {

        try {



            log.info("Webhook Payload Received");

            log.info(payload);



            JsonNode root =
                    mapper.readTree(payload);

            JsonNode messages =
                    root.path("entry")
                            .get(0)
                            .path("changes")
                            .get(0)
                            .path("value")
                            .path("messages");



            if (
                    messages.isMissingNode()
                            ||
                            !messages.isArray()
                            ||
                            messages.isEmpty()
            ) {

                log.warn(
                        "No messages found in webhook"
                );

                return ResponseEntity.ok()
                        .build();
            }

            JsonNode message =
                    messages.get(0);



            String from =
                    message.path("from")
                            .asText();

            String body =
                    message.path("text")
                            .path("body")
                            .asText();

            String messageId =
                    message.path("id")
                            .asText();

            String type =
                    message.path("type")
                            .asText();

            String timestamp =
                    message.path("timestamp")
                            .asText();



            log.info(
                    "================================="
            );

            log.info(
                    "WhatsApp Message Received"
            );

            log.info(
                    "From: {}",
                    from
            );

            log.info(
                    "Body: {}",
                    body
            );

            log.info(
                    "Message ID: {}",
                    messageId
            );

            log.info(
                    "Type: {}",
                    type
            );

            log.info(
                    "Timestamp: {}",
                    timestamp
            );

            log.info(
                    "================================="
            );



            boolean verified =
                    verifyService
                            .verifyWhatsappResponse(
                                    from,
                                    body
                            );


            if (verified) {

                log.info(
                        "Verification Success For {}",
                        from
                );

                return ResponseEntity.ok()
                        .body("Verification Success");
            }

         

            log.warn(
                    "Verification Failed For {}",
                    from
            );

            return ResponseEntity.badRequest()
                    .body("Verification Failed");

        } catch (Exception e) {

            log.error(
                    "Webhook Processing Error",
                    e
            );

            return ResponseEntity.badRequest()
                    .body("Webhook Error");
        }
    }
}