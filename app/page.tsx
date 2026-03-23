'use client';

import { useState, useRef, useCallback } from 'react';
import { UploadCloud, FolderPlus, FilePlus, X, Link as LinkIcon, CheckCircle, Loader2, Send } from 'lucide-react';

type FileItem = {
  id: string;
  file: File;
  path: string;
  progress: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  s3Key?: string;
};

type ExpiryDays = '1' | '3' | '7';

export default function Home() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [expiryDays, setExpiryDays] = useState<ExpiryDays>('7');
  const [uploading, setUploading] = useState(false);
  const [shortUrl, setShortUrl] = useState('');
  const [copied, setCopied] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleFilesAdded = (newFiles: FileList | File[]) => {
    const fileItems: FileItem[] = Array.from(newFiles).map((f: any) => ({
      id: Math.random().toString(36).substring(7),
      file: f,
      path: f.webkitRelativePath || f.name,
      progress: 0,
      status: 'pending',
    }));
    setFiles((prev) => [...prev, ...fileItems]);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      handleFilesAdded(e.dataTransfer.files);
    }
  }, []);

  const uploadViaProxy = async (fileItem: FileItem, key: string) => {
    const formData = new FormData();
    formData.append('file', fileItem.file);
    formData.append('key', key);

    const res = await fetch('/api/upload/proxy', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      throw new Error('Proxy upload failed');
    }
  };

  const uploadToS3 = async (fileItem: FileItem, url: string, key: string) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          setFiles((prev) =>
            prev.map((f) => (f.id === fileItem.id ? { ...f, progress: percent, status: 'uploading' } : f))
          );
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setFiles((prev) =>
            prev.map((f) => (f.id === fileItem.id ? { ...f, progress: 100, status: 'done', s3Key: key } : f))
          );
          resolve(true);
        } else {
          setFiles((prev) =>
            prev.map((f) => (f.id === fileItem.id ? { ...f, status: 'error' } : f))
          );
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        // Fallback for buckets where direct browser uploads fail due CORS configuration.
        uploadViaProxy(fileItem, key)
          .then(() => {
            setFiles((prev) =>
              prev.map((f) => (f.id === fileItem.id ? { ...f, progress: 100, status: 'done', s3Key: key } : f))
            );
            resolve(true);
          })
          .catch(() => {
            setFiles((prev) =>
              prev.map((f) => (f.id === fileItem.id ? { ...f, status: 'error' } : f))
            );
            reject(new Error('Network error during upload'));
          });
      };

      xhr.send(fileItem.file);
    });
  };

  const handleTransfer = async () => {
    if (files.length === 0) return;
    setUploading(true);

    try {
      // 1. Get presigned URLs
      const res = await fetch('/api/upload/presigned', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: files.map((f) => ({ name: f.path, type: f.file.type || 'application/octet-stream', size: f.file.size })),
        }),
      });

      if (!res.ok) throw new Error('Failed to get presigned URLs');
      const { presignedUrls } = await res.json();

      // 2. Upload files in parallel
      const uploadPromises = files.map((fileItem, index) => {
        const { url, key } = presignedUrls[index];
        return uploadToS3(fileItem, url, key).then(() => ({
          path: fileItem.path,
          name: fileItem.file.name,
          key: key,
          size: fileItem.file.size,
          type: fileItem.file.type
        }));
      });

      const uploadedFilesData = await Promise.all(uploadPromises);

      // 3. Create Transfer record
      const transferRes = await fetch('/api/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          message,
          expiryDays,
          files: uploadedFilesData,
        }),
      });

      if (!transferRes.ok) throw new Error('Failed to create transfer record');
      const { shortCode } = await transferRes.json();

      const link = `${window.location.origin}/d/${shortCode}`;
      setShortUrl(link);
    } catch (error) {
      console.error(error);
      alert('An error occurred during transfer. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(shortUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalSize = files.reduce((acc, f) => acc + f.file.size, 0);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  if (shortUrl) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-indigo-100 via-purple-100 to-pink-100 animate-gradient-bg">
        <div className="glass-panel max-w-md w-full rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl transition-all duration-500 transform hover:scale-105">
          <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center mb-6 shadow-inner">
            <CheckCircle size={40} className="animate-bounce" />
          </div>
          <h1 className="text-3xl font-display font-bold text-slate-800 mb-2">You're done!</h1>
          <p className="text-slate-500 mb-8">Copy your link or send it to your friends.</p>
          
          <div className="w-full bg-white/50 border border-white/60 rounded-xl p-4 flex items-center justify-between shadow-sm group">
            <span className="text-sm font-medium text-slate-700 truncate mr-4">{shortUrl}</span>
            <button
              onClick={copyLink}
              className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg transition-colors shrink-0"
            >
              {copied ? <CheckCircle size={20} /> : <LinkIcon size={20} />}
            </button>
          </div>
          
          <button 
            onClick={() => { setShortUrl(''); setFiles([]); setTitle(''); setMessage(''); setExpiryDays('7'); }}
            className="mt-8 text-indigo-600 hover:text-indigo-800 text-sm font-semibold transition-colors"
          >
            Send another transfer
          </button>
        </div>
      </main>
    );
  }

  return (
    <main 
      className="min-h-screen flex items-center justify-center p-4 py-12 bg-linear-to-br from-indigo-100 via-purple-100 to-pink-100 animate-gradient-bg"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="glass-panel w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="p-8 pb-4 border-b border-white/30">
          <h1 className="text-4xl font-display font-extrabold text-transparent bg-clip-text bg-linear-to-r from-indigo-600 to-purple-600 mb-2">
            Send It.
          </h1>
          <p className="text-slate-600 font-medium text-sm">Transfer files beautifully.</p>
        </div>

        {/* File List or Dropzone */}
        <div className="flex-1 p-8 flex flex-col gap-6">
          {files.length === 0 ? (
            <div className="flex-1 border-2 border-dashed border-indigo-200 rounded-2xl flex flex-col items-center justify-center p-8 text-center bg-white/20 hover:bg-white/40 transition-colors">
              <UploadCloud size={64} className="text-indigo-400 mb-4" />
              <h3 className="text-lg font-bold text-slate-800 mb-2">Drag and drop files</h3>
              <p className="text-slate-500 text-sm mb-6">or browse your device</p>
              
              <div className="flex gap-4">
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-white/70 hover:bg-indigo-50 border border-indigo-100 text-indigo-700 px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-all flex items-center gap-2"
                >
                  <FilePlus size={16} /> Files
                </button>
                <button 
                  onClick={() => folderInputRef.current?.click()}
                  className="bg-white/70 hover:bg-indigo-50 border border-indigo-100 text-indigo-700 px-4 py-2 rounded-xl text-sm font-semibold shadow-sm transition-all flex items-center gap-2"
                >
                  <FolderPlus size={16} /> Folders
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1 h-62.5">
              <div className="flex justify-between items-center mb-4">
                <span className="text-sm font-bold text-slate-700">{files.length} file{files.length !== 1 ? 's' : ''} added</span>
                <div className="flex gap-2">
                  <button onClick={() => fileInputRef.current?.click()} className="text-indigo-600 hover:text-indigo-800 p-1 bg-indigo-50 rounded-full transition-colors" title="Add files"><FilePlus size={16}/></button>
                  <button onClick={() => folderInputRef.current?.click()} className="text-indigo-600 hover:text-indigo-800 p-1 bg-indigo-50 rounded-full transition-colors" title="Add folder"><FolderPlus size={16}/></button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 flex flex-col gap-3">
                {files.map((file) => (
                  <div key={file.id} className="bg-white/60 border border-white shadow-sm rounded-xl p-3 flex items-center justify-between group">
                    <div className="flex-1 truncate mr-4">
                      <p className="text-sm font-semibold text-slate-800 truncate">{file.path}</p>
                      <p className="text-xs text-slate-500">{formatSize(file.file.size)}</p>
                      {file.status !== 'pending' && (
                        <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2">
                          <div 
                            className={`h-1.5 rounded-full transition-all duration-300 ${file.status === 'error' ? 'bg-red-500' : 'bg-indigo-500'}`} 
                            style={{ width: `${file.progress}%` }}
                          ></div>
                        </div>
                      )}
                    </div>
                    {file.status === 'pending' && (
                      <button onClick={() => removeFile(file.id)} className="text-slate-400 hover:text-red-500 transition-colors p-1">
                        <X size={18} />
                      </button>
                    )}
                    {file.status === 'done' && <CheckCircle size={18} className="text-green-500" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form */}
          <div className="flex flex-col gap-3">
            <input 
              type="text" 
              placeholder="Title (optional)" 
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={uploading}
              className="w-full bg-white/50 border border-white border-b-indigo-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-slate-800 placeholder-slate-400"
            />
            <textarea 
              placeholder="Message (optional)" 
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={uploading}
              rows={2}
              className="w-full bg-white/50 border border-white border-b-indigo-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none font-medium text-slate-800 placeholder-slate-400"
            />
            <label className="text-xs font-semibold text-slate-600" htmlFor="expiryDays">
              Link expiration
            </label>
            <select
              id="expiryDays"
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value as ExpiryDays)}
              disabled={uploading}
              className="w-full bg-white/50 border border-white border-b-indigo-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-medium text-slate-800"
            >
              <option value="1">1 day</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-white/40 border-t border-white/50 flex items-center justify-between">
          <div className="text-xs font-semibold text-slate-600">
            {files.length > 0 ? formatSize(totalSize) : '0 B'}
          </div>
          <button
            onClick={handleTransfer}
            disabled={files.length === 0 || uploading}
            className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-white transition-all shadow-lg ${
              files.length === 0 || uploading
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 hover:shadow-indigo-500/30'
            }`}
          >
            {uploading ? (
              <><Loader2 size={18} className="animate-spin" /> Transferring...</>
            ) : (
              <><Send size={18} /> Transfer</>
            )}
          </button>
        </div>
      </div>

      <input 
        type="file" 
        multiple 
        className="hidden" 
        ref={fileInputRef} 
        onChange={(e) => e.target.files && handleFilesAdded(e.target.files)} 
      />
      <input 
        type="file" 
        className="hidden" 
        ref={folderInputRef} 
        onChange={(e) => e.target.files && handleFilesAdded(e.target.files)} 
        {...({ webkitdirectory: '', directory: '' } as any)} 
      />
    </main>
  );
}