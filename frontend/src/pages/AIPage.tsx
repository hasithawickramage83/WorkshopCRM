import { useState } from 'react';
import { Bot, Send, Loader2, Wrench, MessageSquare, Shield, TrendingUp, FileText } from 'lucide-react';
import { aiApi } from '../lib/api';

const AI_MODES = [
  { id: 'WORKSHOP_ASSISTANT', label: 'Workshop Assistant', icon: Wrench, desc: 'Repair scope, time estimates, parts' },
  { id: 'CUSTOMER_MESSAGE', label: 'Customer Message', icon: MessageSquare, desc: 'SMS/Email follow-ups & updates' },
  { id: 'INSURANCE_ASSISTANT', label: 'Insurance Assistant', icon: Shield, desc: 'Claim summaries & assessment reports' },
  { id: 'SALES_ASSISTANT', label: 'Sales Assistant', icon: TrendingUp, desc: 'Lead replies & sales pitches' },
  { id: 'QUOTATION_GENERATOR', label: 'Quotation Generator', icon: FileText, desc: 'Professional quote text & pricing' },
];

const EXAMPLE_CONTEXT = `Customer visited workshop.

Vehicle: Toyota Aqua
Damage: Front bumper cracked, left headlight broken

Generate repair scope, estimated time, and customer message.`;

export default function AIPage() {
  const [mode, setMode] = useState('WORKSHOP_ASSISTANT');
  const [context, setContext] = useState(EXAMPLE_CONTEXT);
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setResponse('');
    try {
      const res = await aiApi.generate({ type: mode, context });
      setResponse(res.data.data.content);
    } catch {
      setError('AI generation failed. Check DeepSeek API configuration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="w-7 h-7 text-brand-600" />
          AI Assistant
        </h1>
        <p className="text-gray-500 mt-1">Powered by DeepSeek — workshop, sales, insurance & customer communication</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {AI_MODES.map(({ id, label, icon: Icon, desc }) => (
          <button
            key={id}
            onClick={() => setMode(id)}
            className={`card text-left p-4 transition-all ${
              mode === id ? 'ring-2 ring-brand-500 bg-brand-50' : 'hover:shadow-md'
            }`}
          >
            <Icon className={`w-5 h-5 mb-2 ${mode === id ? 'text-brand-600' : 'text-gray-400'}`} />
            <p className="font-medium text-sm">{label}</p>
            <p className="text-xs text-gray-500 mt-1">{desc}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card space-y-4">
          <h3 className="font-semibold">Input Context</h3>
          <textarea
            className="input min-h-[200px] font-mono text-sm"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Describe the job, customer, damage, or lead..."
          />
          <button
            onClick={handleGenerate}
            disabled={loading || !context.trim()}
            className="btn-primary flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Generate with DeepSeek
          </button>
          {error && <p className="text-red-600 text-sm">{error}</p>}
        </div>

        <div className="card space-y-4">
          <h3 className="font-semibold">AI Response</h3>
          {loading ? (
            <div className="flex items-center justify-center py-20 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mr-2" /> Generating...
            </div>
          ) : response ? (
            <div className="bg-gray-50 rounded-lg p-4 text-sm whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">
              {response}
            </div>
          ) : (
            <div className="text-center py-20 text-gray-400 text-sm">
              AI response will appear here
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
