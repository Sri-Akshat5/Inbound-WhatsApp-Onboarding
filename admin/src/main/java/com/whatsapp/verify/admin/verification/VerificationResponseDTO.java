package com.whatsapp.verify.admin.verification;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class VerificationResponseDTO {


    private String sessionId;
    private String verificationCode;


}
