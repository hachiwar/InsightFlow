package com.echomind.agent;

import com.echomind.llm.LlmGateway;

import java.time.Duration;
import java.time.Instant;

public class DataAgent extends BaseAgent {

    private final AskDataClient askDataClient;

    public DataAgent(LlmGateway llmGateway, AskDataClient askDataClient) {
        super(llmGateway);
        this.askDataClient = askDataClient;
    }

    @Override
    public AgentType type() {
        return AgentType.DATA;
    }

    @Override
    protected String systemPrompt() {
        return "你是企业数据分析助手。";
    }

    @Override
    public AgentResponse handle(AgentRequest request) {
        Instant start = Instant.now();
        try {
            String content = askDataClient.query(request.message());
            long latency = Duration.between(start, Instant.now()).toMillis();
            stats().record(true, latency);
            return new AgentResponse(type(), content, true, 1.0, latency, false);
        } catch (Exception ex) {
            long latency = Duration.between(start, Instant.now()).toMillis();
            stats().record(false, latency);
            return new AgentResponse(type(), "AskData 数据查询服务暂时不可用。", false, 0.0, latency, false);
        }
    }
}
