import { useEffect, useRef } from 'react';

interface Props {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
}

export default function VideoTile({ stream, label, muted }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="video-tile">
      <video ref={videoRef} autoPlay playsInline muted={muted} />
      <div className="label">{label}</div>
    </div>
  );
}
