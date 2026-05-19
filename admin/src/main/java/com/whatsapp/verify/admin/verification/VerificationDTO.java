package com.whatsapp.verify.admin.verification;


import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class VerificationDTO {


    private String phoneNo;
    private String ipAddress;
    private String deviceId;


}
