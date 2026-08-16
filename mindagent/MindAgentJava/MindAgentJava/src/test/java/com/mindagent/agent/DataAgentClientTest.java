package com.mindagent.agent;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DataAgentClientTest {

    @Test
    void usesVerifiedQuestionAwareAnswerAndInternalApiKey() throws Exception {
        HttpServer server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/query", exchange -> {
            assertEquals("internal-secret", exchange.getRequestHeaders().getFirst("X-Internal-API-Key"));
            String response = """
                    {"success":true,"answer":"近 6 个月中 2 月出现亏损。","verified":true,
                     "step_logs":[{"sql":"SELECT month FROM profit","execution_result":
                     {"success":true,"rows":[{"month":"2026-02"}],"truncated":false}}]}
                    """;
            byte[] body = response.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        try {
            DataAgentClient client = new DataAgentClient(
                    "http://127.0.0.1:" + server.getAddress().getPort(),
                    Duration.ofSeconds(2),
                    "internal-secret",
                    new ObjectMapper()
            );
            String result = client.query("近 6 个月哪些月份亏损？");
            assertTrue(result.startsWith("近 6 个月中 2 月出现亏损。"));
            assertTrue(result.contains("结果一致性校验：通过。"));
            assertTrue(result.contains("SELECT month FROM profit"));
        } finally {
            server.stop(0);
        }
    }
}
