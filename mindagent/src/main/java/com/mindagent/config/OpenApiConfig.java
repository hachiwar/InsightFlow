package com.mindagent.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.License;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import io.swagger.v3.oas.models.servers.Server;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI mindAgentOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("MindAgent Java API")
                        .version("0.1.0")
                        .description("MindAgent Java 智能客服系统接口文档，支持在线调试 /chat、/search、知识库、监控和评测接口。")
                        .license(new License().name("Internal Project")))
                .components(new Components().addSecuritySchemes(
                        "ApiKeyAuth",
                        new SecurityScheme()
                                .type(SecurityScheme.Type.APIKEY)
                                .in(SecurityScheme.In.HEADER)
                                .name("X-API-Key")
                ))
                .addSecurityItem(new SecurityRequirement().addList("ApiKeyAuth"))
                .servers(List.of(new Server().url("/").description("Current deployment")));
    }
}
