package com.echomind.security;

import com.echomind.config.EchoMindProperties;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ApiKeyFilterTest {

    @Test
    void protectsApplicationEndpointsAndLeavesHealthPublic() throws Exception {
        EchoMindProperties properties = new EchoMindProperties();
        properties.getSecurity().setEnabled(true);
        properties.getSecurity().setApiKey("test-secret");
        ApiKeyFilter filter = new ApiKeyFilter(properties);

        MockHttpServletRequest denied = new MockHttpServletRequest("POST", "/chat");
        MockHttpServletResponse deniedResponse = new MockHttpServletResponse();
        filter.doFilter(denied, deniedResponse, new MockFilterChain());
        assertEquals(401, deniedResponse.getStatus());

        MockHttpServletRequest allowed = new MockHttpServletRequest("POST", "/chat");
        allowed.addHeader(ApiKeyFilter.HEADER_NAME, "test-secret");
        MockHttpServletResponse allowedResponse = new MockHttpServletResponse();
        filter.doFilter(allowed, allowedResponse, new MockFilterChain());
        assertEquals(200, allowedResponse.getStatus());

        MockHttpServletRequest health = new MockHttpServletRequest("GET", "/health");
        MockHttpServletResponse healthResponse = new MockHttpServletResponse();
        filter.doFilter(health, healthResponse, new MockFilterChain());
        assertEquals(200, healthResponse.getStatus());
    }
}
