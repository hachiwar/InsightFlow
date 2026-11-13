package com.mindagent.security;

import com.mindagent.config.MindAgentProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class ApiKeyFilter extends OncePerRequestFilter {

    public static final String HEADER_NAME = "X-API-Key";
    public static final String AUTHENTICATED_USER_ATTRIBUTE = ApiKeyFilter.class.getName() + ".principal";

    private final MindAgentProperties properties;

    public ApiKeyFilter(MindAgentProperties properties) {
        this.properties = properties;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path.equals("/health")
                || path.equals("/docs")
                || path.startsWith("/swagger-ui/")
                || path.startsWith("/webjars/")
                || path.startsWith("/v3/api-docs")
                || path.equals("/actuator/health")
                || path.startsWith("/actuator/health/");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        MindAgentProperties.Security security = properties.getSecurity();
        if (!security.isEnabled()) {
            filterChain.doFilter(request, response);
            return;
        }

        boolean adminEndpoint = isAdminEndpoint(request.getRequestURI());
        String expected = adminEndpoint ? security.getAdminApiKey() : security.getApiKey();
        if (expected == null || expected.isBlank()) {
            writeError(
                    response,
                    HttpServletResponse.SC_SERVICE_UNAVAILABLE,
                    adminEndpoint ? "admin_api_key_not_configured" : "api_key_not_configured"
            );
            return;
        }

        String actual = request.getHeader(HEADER_NAME);
        boolean matches = actual != null && MessageDigest.isEqual(
                actual.getBytes(StandardCharsets.UTF_8),
                expected.getBytes(StandardCharsets.UTF_8)
        );
        if (!matches) {
            writeError(response, HttpServletResponse.SC_UNAUTHORIZED, "unauthorized");
            return;
        }

        String principal = adminEndpoint ? "admin" : security.getPrincipalId();
        request.setAttribute(
                AUTHENTICATED_USER_ATTRIBUTE,
                principal == null || principal.isBlank() ? "api-client" : principal
        );
        filterChain.doFilter(request, response);
    }

    private boolean isAdminEndpoint(String path) {
        return path.equals("/knowledge/add")
                || path.equals("/knowledge/upload")
                || path.equals("/eval/run");
    }

    private void writeError(HttpServletResponse response, int status, String error) throws IOException {
        response.setStatus(status);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("application/json");
        response.getWriter().write("{\"error\":\"" + error + "\"}");
    }
}
