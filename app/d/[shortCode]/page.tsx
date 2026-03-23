import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { getS3Client } from '@/lib/s3-client';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Download, File as FileIcon, HardDrive, Clock, Image as ImageIcon, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

function formatSize(bytes: number) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default async function DownloadPage({ params }: { params: Promise<{ shortCode: string }> }) {
  const { shortCode } = await params;

  const transfer = await prisma.transfer.findUnique({
    where: { shortCode },
    include: { files: true }
  });

  if (!transfer) return notFound();
  if (transfer.expiresAt < new Date()) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-linear-to-br from-slate-100 to-slate-200">
        <div className="glass-panel p-8 rounded-3xl text-center max-w-md w-full shadow-2xl">
          <Clock size={48} className="mx-auto text-slate-400 mb-4" />
          <h1 className="text-2xl font-display font-bold text-slate-800">Transfer Expired</h1>
          <p className="text-slate-500 mt-2">This link is no longer valid. The files have been deleted.</p>
        </div>
      </main>
    );
  }

  const s3Client = getS3Client();
  const bucketName = process.env.STORAGE_BUCKET_NAME!;

  const filesWithUrls = await Promise.all(
    transfer.files.map(async (f) => {
      const getCmd = new GetObjectCommand({
        Bucket: bucketName,
        Key: f.key,
        ResponseContentDisposition: `attachment; filename="${encodeURIComponent(f.name)}"`,
      });
      const previewCmd = new GetObjectCommand({
        Bucket: bucketName,
        Key: f.key,
      });
      // 24 hour URL expiration
      const [downloadUrl, previewUrl] = await Promise.all([
        getSignedUrl(s3Client, getCmd, { expiresIn: 3600 * 24 }),
        getSignedUrl(s3Client, previewCmd, { expiresIn: 3600 * 24 }),
      ]);
      return { ...f, downloadUrl, previewUrl };
    })
  );

  const totalSize = filesWithUrls.reduce((acc, f) => acc + f.size, 0);

  return (
    <main className="min-h-screen flex items-center justify-center p-4 py-12 bg-linear-to-br from-indigo-100 via-purple-100 to-pink-100 animate-gradient-bg">
      <div className="glass-panel w-full max-w-3xl rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row">
        {/* Sidebar */}
        <div className="bg-white/40 p-8 md:w-1/3 flex flex-col border-b md:border-b-0 md:border-r border-white/50">
          <h1 className="text-3xl font-display font-extrabold text-transparent bg-clip-text bg-linear-to-r from-indigo-600 to-purple-600 mb-8">
            Send It.
          </h1>
          
          <div className="mb-8 flex-1">
            <h2 className="font-bold text-slate-800 text-xl mb-2 leading-tight">
              {transfer.title || 'Ready for download'}
            </h2>
            {transfer.message && (
              <p className="text-slate-600 text-sm whitespace-pre-wrap mt-4 p-4 bg-white/30 rounded-xl border border-white/40 shadow-inner">
                {transfer.message}
              </p>
            )}
          </div>

          <div className="mt-auto pt-6 border-t border-white/30 space-y-4 text-sm font-medium text-slate-600">
            <div className="flex items-center gap-3">
              <HardDrive size={18} className="text-indigo-400" /> 
              <span>{filesWithUrls.length} file{filesWithUrls.length !== 1 ? 's' : ''}, {formatSize(totalSize)}</span>
            </div>
            <div className="flex items-center gap-3">
              <Clock size={18} className="text-indigo-400" /> 
              <span>Expires {formatDistanceToNow(transfer.expiresAt, { addSuffix: true })}</span>
            </div>
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 p-8 flex flex-col bg-white/20">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-800 text-lg">Files</h3>
          </div>

          <div className="flex-1 overflow-y-auto max-h-125 pr-2 flex flex-col gap-3">
            {filesWithUrls.map((f) => {
              const isImage = f.type?.startsWith('image/');
              const isVideo = f.type?.startsWith('video/');
              const isAudio = f.type?.startsWith('audio/');
              const isPdf = f.type === 'application/pdf';
              const isText = f.type?.startsWith('text/') || f.type === 'application/json';
              const isPreviewable = isImage || isVideo || isAudio || isPdf || isText;

              return (
                <div key={f.id} className="bg-white/60 border border-white shadow-sm hover:shadow-md rounded-xl p-3 transition-all duration-300 transform hover:-translate-y-1">
                  <div className="flex items-center group">
                    <div className="w-12 h-12 rounded-xl bg-linear-to-br from-indigo-50 to-purple-50 flex items-center justify-center text-indigo-500 mr-4 shrink-0 shadow-inner border border-white">
                      {isImage ? <ImageIcon size={24} /> : <FileIcon size={24} />}
                    </div>

                    <div className="flex-1 min-w-0 mr-4">
                      <p className="text-sm font-semibold text-slate-800 truncate" title={f.path}>{f.path}</p>
                      <p className="text-xs text-slate-500 font-medium">{formatSize(f.size)}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {isPreviewable && (
                        <a
                          href={f.previewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-3 text-indigo-600 hover:text-white hover:bg-indigo-600 bg-indigo-50 rounded-xl transition-all shadow-sm"
                          title="Preview file"
                        >
                          <Eye size={20} />
                        </a>
                      )}
                      <a
                        href={f.downloadUrl}
                        download={f.name}
                        className="p-3 text-indigo-600 hover:text-white hover:bg-indigo-600 bg-indigo-50 rounded-xl transition-all shadow-sm"
                        title="Download file"
                      >
                        <Download size={20} />
                      </a>
                    </div>
                  </div>

                  {isPreviewable && (
                    <div className="mt-3 rounded-xl border border-white bg-white/50 p-3">
                      {isImage && (
                        <img src={f.previewUrl} alt={f.name} className="max-h-64 w-auto rounded-lg" />
                      )}
                      {isVideo && (
                        <video controls className="max-h-64 w-full rounded-lg" src={f.previewUrl} />
                      )}
                      {isAudio && (
                        <audio controls className="w-full" src={f.previewUrl} />
                      )}
                      {isPdf && (
                        <iframe src={f.previewUrl} className="h-72 w-full rounded-lg" title={`Preview ${f.name}`} />
                      )}
                      {isText && (
                        <a
                          href={f.previewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-indigo-700 hover:text-indigo-900"
                        >
                          Open text preview in a new tab
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
