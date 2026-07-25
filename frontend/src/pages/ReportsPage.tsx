import React, { useEffect, useState } from 'react';
import { FileText, Download, FileCode, Calendar, ShieldCheck } from 'lucide-react';
import { getReports } from '../services/api';
import { Report } from '../types';

export const ReportsPage: React.FC = () => {
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);

  useEffect(() => {
    getReports().then(reps => {
      setReports(reps);
      if (reps.length > 0) setSelectedReport(reps[0]);
    }).catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-cyan-400" />
          Cyber Threat Intelligence Reports Archive
        </h2>
        <p className="text-xs text-slate-400">Automated Markdown and PDF intelligence reports generated after each scraping & LLM analysis cycle.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Reports Archive List */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Generated Reports ({reports.length})</h3>

          <div className="space-y-2">
            {reports.map((rep) => (
              <div
                key={rep.id}
                onClick={() => setSelectedReport(rep)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedReport?.id === rep.id 
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-white shadow-lg' 
                    : 'bg-darkCard border-darkBorder text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold text-white flex items-center justify-between mb-1">
                  <span>{rep.title}</span>
                  <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-2 py-0.5 rounded font-semibold">{rep.period}</span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                  <Calendar className="w-3 h-3" />
                  <span>{new Date(rep.created_at).toLocaleString()}</span>
                </div>
                <div className="text-[11px] text-amber-400 mt-2 font-medium">
                  {rep.total_threats} Threats • {rep.total_messages} Messages Analyzed
                </div>
              </div>
            ))}

            {reports.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-xs glass-card rounded-xl">
                No reports generated yet. Run scraping cycle to automatically generate Markdown and PDF reports.
              </div>
            )}
          </div>
        </div>

        {/* Selected Report Details & Downloads */}
        <div className="lg:col-span-2 glass-card p-6 rounded-2xl border border-darkBorder space-y-6">
          {selectedReport ? (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-darkBorder">
                <div>
                  <h3 className="text-lg font-bold text-white">{selectedReport.title}</h3>
                  <p className="text-xs text-slate-400">Generated on {new Date(selectedReport.created_at).toLocaleString()}</p>
                </div>

                <div className="flex items-center gap-3">
                  <a
                    href={`/api/reports/${selectedReport.id}/markdown`}
                    download
                    className="flex items-center gap-2 px-3 py-2 bg-darkBorder hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-all border border-white/10"
                  >
                    <FileCode className="w-4 h-4 text-cyan-400" />
                    Download Markdown
                  </a>

                  <a
                    href={`/api/reports/${selectedReport.id}/pdf`}
                    download
                    className="flex items-center gap-2 px-3 py-2 bg-cyan-500 hover:bg-cyan-400 text-darkBg text-xs font-bold rounded-xl transition-all shadow-md shadow-cyan-500/20"
                  >
                    <Download className="w-4 h-4" />
                    Download PDF
                  </a>
                </div>
              </div>

              {/* Summary Box */}
              <div className="p-4 rounded-xl bg-darkCard border border-darkBorder space-y-2">
                <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  Report Summary Findings
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-mono">
                  {selectedReport.summary}
                </p>
              </div>

              {/* Monitored Channels badge list */}
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Monitored Channels Covered</div>
                <div className="flex flex-wrap gap-2">
                  {selectedReport.channels_analyzed.map((ch, idx) => (
                    <span key={idx} className="px-2.5 py-1 rounded-lg bg-darkBorder text-slate-300 text-xs font-mono">
                      @{ch}
                    </span>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-500 text-sm">
              Select a report from the archive list to view summary and download.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
