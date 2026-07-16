package com.echomind.agent;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

public class AskDataClient {

    private final URI queryUri;
    private final Duration timeout;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public AskDataClient(String baseUrl, Duration timeout, ObjectMapper objectMapper) {
        this.queryUri = URI.create(baseUrl.replaceAll("/+$", "") + "/query");
        this.timeout = timeout;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(timeout).build();
    }

    public String query(String question) throws Exception {
        String body = objectMapper.writeValueAsString(Map.of("query", question));
        HttpRequest request = HttpRequest.newBuilder(queryUri)
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException("AskData returned HTTP " + response.statusCode());
        }
        Map<String, Object> result = objectMapper.readValue(response.body(), new TypeReference<>() {});
        return format(result);
    }

    private String format(Map<String, Object> result) {
        StringBuilder answer = new StringBuilder("数据查询完成。\n");
        Object logs = result.get("step_logs");
        if (logs instanceof List<?> steps) {
            for (Object value : steps) {
                if (!(value instanceof Map<?, ?> step)) continue;
                answer.append("\nSQL: ").append(step.get("sql"));
                Object execution = step.get("execution_result");
                if (execution instanceof Map<?, ?> executionResult) {
                    answer.append("\n结果: ").append(executionResult.get("rows"));
                }
            }
        }
        return answer.toString();
    }
}
