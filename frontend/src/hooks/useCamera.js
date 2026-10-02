import { useCallback, useEffect, useRef, useState } from "react";

const CAMERA_ERRORS = {
  NotAllowedError:
    "Camera permission was denied. Allow camera access in your browser settings and try again.",
  SecurityError: "Camera access requires a secure HTTPS connection.",
  NotFoundError: "No camera was found on this device.",
  DevicesNotFoundError: "No camera was found on this device.",
  NotReadableError: "The camera is already in use or could not be started.",
};

const getCameraError = (error) =>
  CAMERA_ERRORS[error?.name] || error?.message || "Unable to start the camera.";

const stopTracks = (stream) => {
  stream?.getTracks().forEach((track) => track.stop());
};

export const useCamera = (videoRef) => {
  const streamRef = useRef(null);
  const sessionRef = useRef(0);
  const mountedRef = useRef(false);
  const cameraStartingRef = useRef(false);
  const activeFacingModeRef = useRef("user");
  const requestedFacingModeRef = useRef("user");

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraSwitching, setCameraSwitching] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [cameraNotice, setCameraNotice] = useState(null);
  const [facingMode, setFacingMode] = useState("user");
  const [isMirrored, setIsMirrored] = useState(true);
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [cameraSessionId, setCameraSessionId] = useState(0);

  const refreshCameraAvailability = useCallback(async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      if (mountedRef.current) {
        setCanSwitchCamera(
          devices.filter((device) => device.kind === "videoinput").length > 1
        );
      }
    } catch {
      if (mountedRef.current) {
        setCanSwitchCamera(false);
      }
    }
  }, []);

  const startCamera = useCallback(async (requestedMode = requestedFacingModeRef.current, replaceStream = false) => {
    if (cameraStartingRef.current || (streamRef.current && !replaceStream)) {
      return;
    }

    cameraStartingRef.current = true;
    const sessionId = ++sessionRef.current;
    setCameraSessionId(sessionId);
    setCameraActive(false);
    setCameraStarting(true);
    setCameraSwitching(replaceStream);
    setCameraError(null);
    setCameraNotice(null);

    stopTracks(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    const requestStream = (facing) => navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30, max: 30 },
      },
    });

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(CAMERA_ERRORS.SecurityError);
      }

      requestedFacingModeRef.current = requestedMode;
      let stream;
      let fallbackNotice = null;
      try {
        stream = await requestStream(requestedMode);
      } catch (error) {
        const rearCameraUnavailable =
          requestedMode === "environment" &&
          ["OverconstrainedError", "NotFoundError", "DevicesNotFoundError"].includes(error.name);

        if (!rearCameraUnavailable) {
          throw error;
        }

        requestedFacingModeRef.current = "user";
        requestedMode = "user";
        fallbackNotice = "Rear camera unavailable. Using the available camera.";
        stream = await requestStream("user");
      }

      if (sessionId !== sessionRef.current) {
        stopTracks(stream);
        return;
      }

      const video = videoRef.current;
      if (!video) {
        stopTracks(stream);
        throw new Error("The camera preview is unavailable.");
      }

      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();

      if (sessionId !== sessionRef.current) {
        stopTracks(stream);
        return;
      }

      const reportedFacingMode = stream.getVideoTracks()[0]?.getSettings().facingMode;
      const activeFacingMode =
        reportedFacingMode === "user" || reportedFacingMode === "environment"
          ? reportedFacingMode
          : requestedMode || "user";

      activeFacingModeRef.current = activeFacingMode;
      setFacingMode(activeFacingMode);
      setIsMirrored(activeFacingMode === "user");
      setCameraActive(true);
      setCameraNotice(
        fallbackNotice || (activeFacingMode === requestedMode
          ? null
          : "Requested camera unavailable. Using the active camera.")
      );
      void refreshCameraAvailability();
    } catch (error) {
      if (sessionId === sessionRef.current) {
        stopTracks(streamRef.current);
        streamRef.current = null;
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        setCameraActive(false);
        setCameraError(getCameraError(error));
      }
    } finally {
      if (sessionId === sessionRef.current) {
        cameraStartingRef.current = false;
        setCameraStarting(false);
        setCameraSwitching(false);
      }
    }
  }, [refreshCameraAvailability, videoRef]);

  const stopCamera = useCallback(() => {
    const sessionId = ++sessionRef.current;
    setCameraSessionId(sessionId);
    cameraStartingRef.current = false;
    stopTracks(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraStarting(false);
    setCameraSwitching(false);
    setCameraError(null);
    setCameraNotice(null);
  }, [videoRef]);

  const switchCamera = useCallback(() => {
    if (cameraStartingRef.current || !canSwitchCamera) {
      return;
    }

    const nextFacingMode = activeFacingModeRef.current === "user"
      ? "environment"
      : "user";
    requestedFacingModeRef.current = nextFacingMode;
    void startCamera(nextFacingMode, true);
  }, [canSwitchCamera, startCamera]);

  useEffect(() => {
    const video = videoRef.current;
    mountedRef.current = true;
    void startCamera("user");

    const mediaDevices = navigator.mediaDevices;
    const handleDeviceChange = () => void refreshCameraAvailability();
    mediaDevices?.addEventListener("devicechange", handleDeviceChange);

    return () => {
      mountedRef.current = false;
      sessionRef.current += 1;
      cameraStartingRef.current = false;
      stopTracks(streamRef.current);
      streamRef.current = null;
      if (video) {
        video.srcObject = null;
      }
      mediaDevices?.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [refreshCameraAvailability, startCamera, videoRef]);

  return {
    cameraActive,
    cameraStarting,
    cameraSwitching,
    cameraError,
    cameraNotice,
    facingMode,
    isMirrored,
    canSwitchCamera,
    cameraSessionId,
    sessionRef,
    startCamera,
    stopCamera,
    switchCamera,
  };
};