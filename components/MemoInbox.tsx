'use client';

import React, { useState, useEffect } from 'react';
import { extractMemo, Fragment } from '@/lib/pp-engine';
import { Sparkles, Send, CheckCircle, Clock } from 'lucide-react';

interface MemoInboxProps {
  onSave: (text: string) => Promise<void>;
  isLoading: boolean;
}

export function MemoInbox({ onSave, isLoading }: MemoInboxProps) {
  const [text, setText] = useState('');
  const [savedStatus, setSavedStatus] = useState<string | null>(null);

  // [개선] 웹 초안 1초 자동저장 (Autosave to localStorage)
  useEffect(() => {
    const savedDraft = localStorage.getItem('pp_web_draft');
    if (savedDraft) setText(savedDraft);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (text) {
        localStorage.setItem('pp_web_draft', text);
        setSavedStatus('초안 자동보관됨');
      } else {
        localStorage.removeItem('pp_web_draft');
        setSavedStatus(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [text]);

  const liveFragments: Fragment[] = extractMemo(text || ' ');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isLoading) return;
    await onSave(text);
    setText('');
    localStorage.removeItem('pp_web_draft');
    setSavedStatus(null);
  };

  return (
    <div className="p-5 rounded-3xl bg-white border border-[#E5E7EB] shadow-xs space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-bold text-gray-900">
          생각함 (Thought Inbox)
        </label>
        {savedStatus && (
          <span className="text-[11px] text-gray-400 font-mono">
            ✓ {savedStatus}
          </span>
        )}
      </div>

      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="21000원 우산 구매&#10;떠오른 생각이나 감정도 자유롭게 적어두세요."
        className="w-full p-3 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#5A7863]"
      />

      {text.trim() && (
        <div className="p-2.5 rounded-xl bg-gray-50 border border-gray-200 text-xs flex items-center gap-2 flex-wrap">
          <span className="font-bold text-gray-700 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-[#5A7863]" /> 파싱 미리보기:
          </span>
          {liveFragments.map((f, i) => (
            <span
              key={i}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                f.status === 'posted'
                  ? 'bg-emerald-100 text-emerald-800'
                  : f.status === 'pending'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              {f.amount ? `${f.amount.toLocaleString()}원 (${f.kind || '미확정'})` : f.categories.join(', ')}
            </span>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSubmit}
          disabled={isLoading || !text.trim()}
          className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-[#5A7863] hover:bg-[#47604F] transition shadow-xs disabled:opacity-50"
        >
          {isLoading ? '저장 중...' : '적어두기'}
        </button>
      </div>
    </div>
  );
}
