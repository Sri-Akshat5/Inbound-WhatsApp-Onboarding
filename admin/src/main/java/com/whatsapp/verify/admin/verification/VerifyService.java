package com.whatsapp.verify.admin.verification;



import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.whatsapp.verify.admin.config.RedisService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Random;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class VerifyService {

    private final RedisService redisService;

    private final VerificationSSEService sseService;
    private final ObjectMapper mapper =
            new ObjectMapper();

    private static final SecureRandom random =
            new SecureRandom();

    public VerificationResponseDTO createSession(
            String token
    ) throws Exception {


        String decodedJson = new String(
                Base64.getDecoder().decode(token),
                StandardCharsets.UTF_8
        );


        VerificationDTO dto =
                mapper.readValue(
                        decodedJson,
                        VerificationDTO.class
                );


        int currentCount =
                redisService.getIpCount(
                        dto.getIpAddress()
                );

        if (currentCount >= 5) {

            throw new RuntimeException(
                    "Too many requests"
            );
        }

        redisService.incrementIpCount(
                dto.getIpAddress()
        );

        String sessionId =
                UUID.randomUUID().toString();

        String code =
                generateCode(dto.getPhoneNo());

        redisService.saveSession(
                sessionId,
                dto.getPhoneNo(),
                code,
                dto.getDeviceId()
        );

        redisService.saveCodeSession(
                code,
                sessionId
        );

        return new VerificationResponseDTO(
                sessionId,
                code
        );
    }

    public String generateCode(
            String phoneNo
    ) {

        String last4 =
                phoneNo.substring(
                        Math.max(
                                phoneNo.length() - 4,
                                0
                        )
                );

        int randomNo =
                100000 + random.nextInt(900000);

        return "WA-" + last4 + "-" + randomNo;
    }


    public boolean verifyWhatsappResponse(
            String from,
            String body
    ) {

        if (body == null || body.isBlank()) {
            return false;
        }

        Pattern pattern =
                Pattern.compile("WA-\\d{4}-\\d{6}");

        Matcher matcher =
                pattern.matcher(body);

        if (!matcher.find()) {

            System.out.println(
                    "Verification code not found"
            );

            return false;
        }

        String code = matcher.group();

        System.out.println(
                "Extracted Code: " + code
        );

        String sessionId =
                redisService.getSessionIdByCode(
                        code
                );

        if (sessionId == null) {

            System.out.println(
                    "Session not found for code"
            );

            return false;
        }

        String storedPhone =
                redisService.getPhoneNo(
                        sessionId
                );

        if (storedPhone == null) {

            System.out.println(
                    "Stored phone not found"
            );

            return false;
        }

        if (!storedPhone.equals(from)) {

            System.out.println(
                    "Phone number mismatch"
            );

            return false;
        }

        redisService.markVerified(
                sessionId
        );

        sseService.sendVerificationSuccess(
                sessionId
        );

        System.out.println(
                "Verification Success"
        );

        return true;
    }
}