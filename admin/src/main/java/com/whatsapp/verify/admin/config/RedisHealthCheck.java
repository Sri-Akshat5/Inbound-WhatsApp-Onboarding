package com.whatsapp.verify.admin.config;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.stereotype.Component;

@Slf4j
@RequiredArgsConstructor
@Component
public class RedisHealthCheck implements CommandLineRunner {

    private final RedisConnectionFactory redisConnectionFactory;

    @Override
    public void run(String... args)  {
        try(RedisConnection connection = redisConnectionFactory.getConnection()) {
            String pong = connection.ping();

            log.info("PONG : {}", pong);

        } catch(Exception ex) {
            log.info("PONG : {}", ex.getMessage());
        }
    }

}
