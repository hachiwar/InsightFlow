package com.mindagent.security;

import com.mindagent.config.MindAgentProperties;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class ApiKeyFilterTest {

    @Test
    void protectsApplicationEndpointsAndLeavesHealthPublic() throws Exception {
        MindAgentProperties properties = new MindAgentProperties();
        properties.getSecurity().setEnabled(true);
        properties.getSecurity().setApiKey("test-secret");
        properties.getSecurity().setAdminApiKey("admin-secret");
        properties.getSecurity().setPrincipalId("tenant-a");
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
        assertEquals("tenant-a", allowed.getAttribute(ApiKeyFilter.AUTHENTICATED_USER_ATTRIBUTE));

        MockHttpServletRequest deniedAdmin = new MockHttpServletRequest("POST", "/knowledge/add");
        deniedAdmin.addHeader(ApiKeyFilter.HEADER_NAME, "test-secret");
        MockHttpServletResponse deniedAdminResponse = new MockHttpServletResponse();
        filter.doFilter(deniedAdmin, deniedAdminResponse, new MockFilterChain());
        assertEquals(401, deniedAdminResponse.getStatus());
        assertNull(deniedAdmin.getAttribute(ApiKeyFilter.AUTHENTICATED_USER_ATTRIBUTE));

        MockHttpServletRequest allowedAdmin = new MockHttpServletRequest("POST", "/knowledge/add");
        allowedAdmin.addHeader(ApiKeyFilter.HEADER_NAME, "admin-secret");
        MockHttpServletResponse allowedAdminResponse = new MockHttpServletResponse();
        filter.doFilter(allowedAdmin, allowedAdminResponse, new MockFilterChain());
        assertEquals(200, allowedAdminResponse.getStatus());
        assertEquals("admin", allowedAdmin.getAttribute(ApiKeyFilter.AUTHENTICATED_USER_ATTRIBUTE));

        MockHttpServletRequest health = new MockHttpServletRequest("GET", "/health");
        MockHttpServletResponse healthResponse = new MockHttpServletResponse();
        filter.doFilter(health, healthResponse, new MockFilterChain());
        assertEquals(200, healthResponse.getStatus());

        MockHttpServletRequest docs = new MockHttpServletRequest("GET", "/swagger-ui/index.html");
        MockHttpServletResponse docsResponse = new MockHttpServletResponse();
        filter.doFilter(docs, docsResponse, new MockFilterChain());
        assertEquals(200, docsResponse.getStatus());
    }
}
