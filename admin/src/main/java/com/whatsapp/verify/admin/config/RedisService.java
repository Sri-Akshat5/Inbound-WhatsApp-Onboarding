package com.whatsapp.verify.admin.config;

import lombok.NoArgsConstructor;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.time.Duration;

@Service
@RequiredArgsConstructor
public class RedisService {

    private final StringRedisTemplate redisTemplate;

    public void saveSession(
            String sessionId,
            String phoneNo,
            String code,
            String deviceId
    ) {

        String key = "SESSION:" + sessionId;

        redisTemplate.opsForHash().put(
                key,
                "phoneNo",
                phoneNo
        );

        redisTemplate.opsForHash().put(
                key,
                "code",
                code
        );

        redisTemplate.opsForHash().put(
                key,
                "deviceId",
                deviceId
        );

        redisTemplate.opsForHash().put(
                key,
                "verified",
                "false"
        );

        redisTemplate.expire(
                key,
                Duration.ofMinutes(5)
        );
    }

    public void saveCodeSession(
            String code,
            String sessionId
    ) {

        redisTemplate.opsForValue().set(
                "CODE_SESSION:" + code,
                sessionId,
                Duration.ofMinutes(5)
        );
    }

    public String getSessionIdByCode(
            String code
    ) {

        return redisTemplate.opsForValue()
                .get("CODE_SESSION:" + code);
    } public String getPhoneNo(
            String sessionId
    ) {

        Object value = redisTemplate.opsForHash()
                .get("SESSION:" + sessionId,
                        "phoneNo");

        return value == null
                ? null
                : value.toString();
    }

    public String getCode(
            String sessionId
    ) {

        Object value = redisTemplate.opsForHash()
                .get("SESSION:" + sessionId,
                        "code");

        return value == null
                ? null
                : value.toString();
    }



    public void markVerified(
            String sessionId
    ) {

        redisTemplate.opsForHash().put(
                "SESSION:" + sessionId,
                "verified",
                "true"
        );
    }



    public int getIpCount(String ip) {

        String value = redisTemplate.opsForValue()
                .get("IP_LIMIT:" + ip);

        return value == null
                ? 0
                : Integer.parseInt(value);
    }

    public void incrementIpCount(
            String ip
    ) {

        String key = "IP_LIMIT:" + ip;

        Long count = redisTemplate.opsForValue()
                .increment(key);

        if (count != null && count == 1) {

            redisTemplate.expire(
                    key,
                    Duration.ofMinutes(10)
            );
        }
    }



    public void deleteSession(
            String sessionId
    ) {

        redisTemplate.delete(
                "SESSION:" + sessionId
        );
    }
}