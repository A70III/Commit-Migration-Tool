import { GoogleGenerativeAI } from '@google/generative-ai';

export type AIProvider = 'gemini' | 'openai' | 'deepseek' | 'openrouter' | 'lmstudio';

export interface GeneratePRParams {
  provider: AIProvider;
  apiKey: string;
  diffContent: string;
  template?: string; // Optional custom template
}

const defaultTemplate = `
You are an expert developer. Analyze the following git diff and write a pull request description.
Output should be strictly in Markdown format without conversational greetings.
Follow this format:
# {{Title}}
## What changed?
- Detailed bullet points of modifications...
## Why?
- The purpose or value of the changes.

---
Diff Content:
{{diff}}
`;

export async function generatePRContent(params: GeneratePRParams): Promise<string> {
  const { provider, apiKey, diffContent } = params;
  
  const template = params.template || defaultTemplate;
  const prompt = template.replace('{{diff}}', diffContent);

  try {
    if (provider === 'gemini') {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // or pro
      const result = await model.generateContent(prompt);
      return result.response.text();
    } 
    
    // For OpenAI-compatible endpoints
    let endpoint = '';
    let modelName = '';
    
    switch (provider) {
      case 'openai':
        endpoint = 'https://api.openai.com/v1/chat/completions';
        modelName = 'gpt-4o'; // or gpt-4o-mini
        break;
      case 'deepseek':
        endpoint = 'https://api.deepseek.com/chat/completions';
        modelName = 'deepseek-chat';
        break;
      case 'openrouter':
        endpoint = 'https://openrouter.ai/api/v1/chat/completions';
        modelName = 'anthropic/claude-3.5-sonnet'; // Default openrouter model
        break;
      case 'lmstudio':
        endpoint = 'http://localhost:1234/v1/chat/completions';
        modelName = 'local-model'; // LM Studio ignores this anyway if 1 model is loaded
        break;
      default:
        throw new Error("Unsupported provider");
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (provider !== 'lmstudio') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'http://localhost:3000'; // For OR
      headers['X-Title'] = 'Commit Migration Tool';
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: modelName,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI Provider Error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No completion returned';
    
  } catch (err: any) {
    console.error("AI Generation Error", err);
    throw err;
  }
}
