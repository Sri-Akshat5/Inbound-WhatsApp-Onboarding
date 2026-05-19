package com.whatsapp.verify.admin.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class CorsConfig implements WebMvcConfigurer {

    @Override
    public void addCorsMappings(
            CorsRegistry registry
    ) {

        registry.addMapping("/**")

                // Frontend URL
                .allowedOrigins(
                        "http://localhost:3000",
                        "http://localhost:5174"
                )

                // Allowed methods
                .allowedMethods(
                        "GET",
                        "POST",
                        "PUT",
                        "DELETE",
                        "OPTIONS"
                )

                // Allowed headers
                .allowedHeaders("*")

                // Allow cookies/auth
                .allowCredentials(true)

                // Cache preflight response
                .maxAge(3600);
    }
}