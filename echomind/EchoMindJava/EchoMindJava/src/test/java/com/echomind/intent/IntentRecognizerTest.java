package com.echomind.intent;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class IntentRecognizerTest {

    @Test
    void fallsBackToPatternsWhenLlmResponseIsNotClassifierJson() {
        IntentRecognizer recognizer = new IntentRecognizer(
                (system, user, temperature, maxTokens) -> "当前模型服务不可用",
                new ObjectMapper()
        );

        IntentResult result = recognizer.recognize(
                "查询总交易笔数大于 50000 的用户利率",
                List.of()
        );

        assertEquals(IntentCategory.DATA_QUERY, result.intent());
    }
}
