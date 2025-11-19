import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { 
  requests, 
  functionCalls,
  loadDataFromText 
} from '../src/lib/stores.js';

describe('UI Data Verification from Real Files', () => {
  beforeEach(() => {
    requests.set([]);
    functionCalls.set([]);
  });

  it('java-sim-requests: verify key UI data', () => {
    const filePath = resolve('data', 'java-sim-requests-claudesonnet4.txt');
    const fileContent = readFileSync(filePath, 'utf-8');
    
    loadDataFromText(fileContent);

    const reqsData = get(requests);
    const callsData = get(functionCalls);

    // 1. Total tool calls in overview
    expect(callsData.length).toBeGreaterThan(0);
    console.log(`[sim-requests] Total tool calls: ${callsData.length}`);

    // 2. First 10 tool call names
    const first10Calls = callsData.slice(0, 10);
    console.log('[sim-requests] First 10 tool call names:');
    first10Calls.forEach((call, idx) => {
      expect(call.name).toBeDefined();
      expect(call.name).not.toBe('');
      console.log(`  ${idx + 1}. ${call.name}`);
    });

    // 3. First 3 tool calls: system prompt, user prompt, request options
    const first3Calls = callsData.slice(0, 3);
    console.log('[sim-requests] First 3 tool calls details:');
    first3Calls.forEach((call, idx) => {
      const req = call.request;
      
      // System prompt
      const systemMsg = req.requestMessages?.find(m => m.role === 'system');
      expect(systemMsg).toBeDefined();
      const systemText = systemMsg?.content?.[0]?.text || '';
      console.log(`  Call ${idx + 1} - System prompt: ${systemText.substring(0, 80)}...`);
      
      // User prompt (skip environment_info, get actual user content)
      const userMsgs = req.requestMessages?.filter(m => m.role === 'user') || [];
      let userText = '';
      for (const msg of userMsgs) {
        const content = msg.content?.[0]?.text || '';
        if (!content.includes('<environment_info>')) {
          userText = content;
          break;
        }
      }
      if (!userText && userMsgs.length > 0) {
        // If all contain environment_info, get the last user message
        userText = userMsgs[userMsgs.length - 1]?.content?.[0]?.text || '';
      }
      console.log(`  Call ${idx + 1} - User prompt: ${userText.substring(0, 80)}...`);
      
      // Request options (tools)
      expect(req.requestOptions).toBeDefined();
      const toolsCount = req.requestOptions?.tools?.length || 0;
      console.log(`  Call ${idx + 1} - Request options: ${toolsCount} tools available`);
    });

    // 4. Parameters (arguments) with values for first 3 calls
    console.log('[sim-requests] First 3 tool calls parameters:');
    first3Calls.forEach((call, idx) => {
      expect(call.arguments).toBeDefined();
      const args = typeof call.arguments === 'string' ? JSON.parse(call.arguments) : call.arguments;
      console.log(`  Call ${idx + 1} - Parameters:`, JSON.stringify(args, null, 2).substring(0, 200));
    });

    // 5. Response result (tool call result) for first 3 calls
    console.log('[sim-requests] First 3 tool calls response (tool result):');
    first3Calls.forEach((call, idx) => {
      // Find the tool result by matching tool_call_id in subsequent requests
      const toolCallId = call.id;
      let toolResult = null;
      
      // Search through all subsequent requests for matching tool message
      for (let i = call.requestIndex + 1; i < reqsData.length && !toolResult; i++) {
        const toolMessages = reqsData[i].requestMessages?.filter(m => m.role === 'tool') || [];
        const matchingMsg = toolMessages.find(tm => tm.tool_call_id === toolCallId);
        if (matchingMsg) {
          const toolContent = matchingMsg.content;
          toolResult = Array.isArray(toolContent) 
            ? toolContent[0]?.text || JSON.stringify(toolContent)
            : toolContent;
          break;
        }
      }
      
      if (toolResult) {
        const resultText = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
        console.log(`  Call ${idx + 1} - Tool result: ${resultText.substring(0, 150).replace(/\n/g, ' | ')}...`);
      } else {
        console.log(`  Call ${idx + 1} - Tool result: (not found)`);
      }
    });
  });

  it('java-fetchlog: verify key UI data', () => {
    const filePath = resolve('data', 'java-fetchlog-claudesonnet4.txt');
    const fileContent = readFileSync(filePath, 'utf-8');
    
    loadDataFromText(fileContent);

    const reqsData = get(requests);
    const callsData = get(functionCalls);

    // 1. Total tool calls in overview
    expect(callsData.length).toBeGreaterThan(0);
    console.log(`[fetchlog] Total tool calls: ${callsData.length}`);

    // 2. First 10 tool call names
    const first10Calls = callsData.slice(0, 10);
    console.log('[fetchlog] First 10 tool call names:');
    first10Calls.forEach((call, idx) => {
      expect(call.name).toBeDefined();
      expect(call.name).not.toBe('');
      console.log(`  ${idx + 1}. ${call.name}`);
    });

    // 3. First 3 tool calls: system prompt, user prompt, request options
    const first3Calls = callsData.slice(0, 3);
    console.log('[fetchlog] First 3 tool calls details:');
    first3Calls.forEach((call, idx) => {
      const req = call.request;
      
      // System prompt (in messages array for fetchlog)
      const systemMsg = (req.messages || req.requestMessages)?.find(m => m.role === 'system');
      expect(systemMsg).toBeDefined();
      const systemContent = typeof systemMsg?.content === 'string' 
        ? systemMsg.content 
        : systemMsg?.content?.[0]?.text || '';
      console.log(`  Call ${idx + 1} - System prompt: ${systemContent.substring(0, 80)}...`);
      
      // User prompt (skip environment_info, get actual user content)
      const userMsgs = (req.messages || req.requestMessages)?.filter(m => m.role === 'user') || [];
      let userContent = '';
      for (const msg of userMsgs) {
        const content = typeof msg?.content === 'string' 
          ? msg.content 
          : msg?.content?.[0]?.text || '';
        if (!content.includes('<environment_info>')) {
          userContent = content;
          break;
        }
      }
      if (!userContent && userMsgs.length > 0) {
        // If all contain environment_info, get the last user message
        const lastMsg = userMsgs[userMsgs.length - 1];
        userContent = typeof lastMsg?.content === 'string' 
          ? lastMsg.content 
          : lastMsg?.content?.[0]?.text || '';
      }
      console.log(`  Call ${idx + 1} - User prompt: ${userContent.substring(0, 80)}...`);
      
      // Request options (tools)
      expect(req.requestOptions).toBeDefined();
      const toolsCount = req.requestOptions?.tools?.length || 0;
      console.log(`  Call ${idx + 1} - Request options: ${toolsCount} tools available`);
    });

    // 4. Parameters (arguments) with values for first 3 calls
    console.log('[fetchlog] First 3 tool calls parameters:');
    first3Calls.forEach((call, idx) => {
      if (call.arguments) {
        expect(typeof call.arguments).toBe('string');
        const args = JSON.parse(call.arguments);
        console.log(`  Call ${idx + 1} - Parameters:`, JSON.stringify(args, null, 2).substring(0, 200));
      } else {
        console.log(`  Call ${idx + 1} - Parameters: none`);
      }
    });

    // 5. Response result (tool call result) for first 3 calls
    console.log('[fetchlog] First 3 tool calls response (tool result):');
    first3Calls.forEach((call, idx) => {
      // Find the tool result by matching tool_call_id in subsequent requests
      const toolCallId = call.id;
      let toolResult = null;
      
      // Search through all subsequent requests for matching tool message
      for (let i = call.requestIndex + 1; i < reqsData.length && !toolResult; i++) {
        const toolMessages = (reqsData[i].messages || reqsData[i].requestMessages)?.filter(m => m.role === 'tool') || [];
        const matchingMsg = toolMessages.find(tm => tm.tool_call_id === toolCallId);
        if (matchingMsg) {
          toolResult = matchingMsg.content;
          break;
        }
      }
      
      if (toolResult) {
        const resultText = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
        console.log(`  Call ${idx + 1} - Tool result: ${resultText.substring(0, 150).replace(/\n/g, ' | ')}...`);
      } else {
        console.log(`  Call ${idx + 1} - Tool result: (not found)`);
      }
    });
  });
});
