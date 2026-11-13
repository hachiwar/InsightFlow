package com.mindagent.api;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.actuate.observability.AutoConfigureObservability;
import org.springframework.boot.test.web.server.LocalServerPort;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "spring.profiles.active=deepseek",
                "spring.ai.deepseek.api-key=mindagent-local-placeholder",
                "mindagent.llm.fallback-enabled=true",
                "mindagent.security.enabled=true",
                "mindagent.security.api-key=test-public-key",
                "mindagent.security.admin-api-key=test-admin-key",
                "spring.data.redis.port=6399",
                "mindagent.data-agent.base-url=http://127.0.0.1:1",
                "mindagent.storage.knowledge-path=target/test-data/openapi/knowledge-store.json",
                "mindagent.storage.memory-path=target/test-data/openapi/memory-store.json",
                "mindagent.eval.baseline-path=target/test-data/openapi/eval-baseline.json"
        }
)
@AutoConfigureObservability
class OpenApiIntegrationTest {

    @LocalServerPort
    private int port;

    @Test
    void servesGeneratedOpenApiDocument() throws Exception {
        HttpResponse<String> response = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/v3/api-docs"))
                        .GET()
                        .build(),
                HttpResponse.BodyHandlers.ofString()
        );

        assertEquals(200, response.statusCode());
        assertTrue(response.body().contains("MindAgent Java API"));
    }
}
