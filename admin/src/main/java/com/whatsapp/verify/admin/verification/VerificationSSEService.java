package com.whatsapp.verify.admin.verification;


import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class VerificationSSEService {

    private final Map<String, SseEmitter> emitterMap = new ConcurrentHashMap<>();

    public SseEmitter createEmitter(String sessionId){
        SseEmitter emitter = new SseEmitter(300000L);

        emitterMap.put(sessionId, emitter);

        emitter.onCompletion(()->emitterMap.remove(sessionId));

        emitter.onTimeout(()->emitterMap.remove(sessionId));

        return emitter;

    }

    public void sendVerificationSuccess(String sessionId){
        SseEmitter emitter = emitterMap.get(sessionId);

        if(emitter == null){
            return;
        }
        try{
            emitter.send(SseEmitter.event().name("Verification").data("SUCCESS"));

            emitter.complete();
        } catch(Exception e){
            emitter.completeWithError(e);
        }
        emitterMap.remove(sessionId);
    }

}
