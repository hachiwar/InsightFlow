package com.mindagent.llm;

public interface LlmGateway {

    String chat(String systemPrompt, String userPrompt, double temperature, int maxTokens);
}
