package com.mindagent.storage;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AtomicJsonWriterTest {

    @TempDir
    Path directory;

    @Test
    void replacesJsonWithoutLeavingTemporaryFiles() throws Exception {
        Path target = directory.resolve("state.json");
        ObjectMapper objectMapper = new ObjectMapper();

        AtomicJsonWriter.write(objectMapper, target, Map.of("version", 1));
        AtomicJsonWriter.write(objectMapper, target, Map.of("version", 2));

        assertEquals(2, objectMapper.readTree(target.toFile()).get("version").asInt());
        try (var files = Files.list(directory)) {
            assertEquals(1, files.count());
        }
    }
}
