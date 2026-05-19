package com.whatsapp.verify.admin.verification;


import com.whatsapp.verify.admin.config.RedisService;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.UUID;

@Slf4j
@RestController
@Data
@RequestMapping("/verification")
public class VerifyController {

  private final RedisService redisService;
  private final VerifyService verifyService;

  private final VerificationSSEService verificationSSEService;

    @PostMapping("/start")
    public VerificationResponseDTO startVerification(
            @RequestBody String token
    ) throws Exception {

        return verifyService.createSession(
                token
        );
    }




    @GetMapping("/events/{sessionId}")
    public SseEmitter streamEvents(
            @PathVariable String sessionId
    ) {

        return verificationSSEService.createEmitter(
                sessionId
        );
    }
}