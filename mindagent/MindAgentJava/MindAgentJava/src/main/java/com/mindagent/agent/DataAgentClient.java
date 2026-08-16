package com.mindagent.agent;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

public class DataAgentClient {

    private final URI queryUri;
    private final Duration timeout;
    private final String apiKey;
    private final HttpClient httpClient;
    private final ObjectMapper objectMapper;

    public DataAgentClient(String baseUrl, Duration timeout, String apiKey, ObjectMapper objectMapper) {
        this.queryUri = URI.create(baseUrl.replaceAll("/+$", "") + "/query");
        this.timeout = timeout;
        this.apiKey = apiKey == null ? "" : apiKey;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder().connectTimeout(timeout).build();
    }

    public String query(String question) throws Exception {
        String body = objectMapper.writeValueAsString(Map.of("query", question));
        HttpRequest.Builder requestBuilder = HttpRequest.newBuilder(queryUri)
                .timeout(timeout)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body));
        if (!apiKey.isBlank()) {
            requestBuilder.header("X-Internal-API-Key", apiKey);
        }
        HttpRequest request = requestBuilder.build();
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IllegalStateException("DataAgent returned HTTP " + response.statusCode());
        }
        Map<String, Object> result = objectMapper.readValue(response.body(), new TypeReference<>() {});
        if (!Boolean.TRUE.equals(result.get("success"))) {
            throw new IllegalStateException("DataAgent query failed: " + result.get("error"));
        }
        return format(result);
    }

    private String format(Map<String, Object> result) {
        StringBuilder answer = new StringBuilder();
        Object summary = result.get("answer");
        if (summary instanceof String text && !text.isBlank()) {
            answer.append(text).append("\n");
        } else {
            answer.append("数据查询完成。\n");
        }
        if (Boolean.TRUE.equals(result.get("verified"))) {
            answer.append("结果一致性校验：通过。\n");
        }
        Object logs = result.get("step_logs");
        if (logs instanceof List<?> steps) {
            for (Object value : steps) {
                if (!(value instanceof Map<?, ?> step)) continue;
                answer.append("\nSQL: ").append(step.get("sql"));
                Object execution = step.get("execution_result");
                if (execution instanceof Map<?, ?> executionResult) {
                    if (!Boolean.TRUE.equals(executionResult.get("success"))) {
                        throw new IllegalStateException("DataAgent execution failed: " + executionResult.get("error"));
                    }
                    answer.append("\n结果: ").append(executionResult.get("rows"));
                    if (Boolean.TRUE.equals(executionResult.get("truncated"))) {
                        answer.append("\n提示: 结果已达到最大行数限制，仅显示前部数据。");
                    }
                }
            }
        }
        return answer.toString();
    }
}
