"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Horizon, rpc } from "@stellar/stellar-sdk";
import { getNetworkConfig } from "./network-config";
import { getActiveContractId } from "./contract";
import { getNetwork } from "./stellar";

export type ConnectionStatus = "connecting" | "connected" | "fallback-polling" | "disconnected" | "error";

export function useJobSubscription(jobId: string | undefined, onUpdate: () => void) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const fallbackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    if (!jobId) return;

    let mounted = true;
    let streamClose: (() => void) | null = null;

    let retryTimeout: NodeJS.Timeout | null = null;
    const fallbackPollCount = 0;

    const startFallbackPolling = () => {
      if (!mounted) return;
      if (status !== "fallback-polling") {
        setStatus("fallback-polling");
      }
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
      }
      fallbackIntervalRef.current = setInterval(async () => {
        try {
          onUpdateRef.current();
        } catch (e) {
          console.error("Fallback polling error", e);
        }
      }, 5000);
    };

    const attemptConnection = () => {
      if (!mounted) return;
      try {
        if (status !== "connected" && status !== "fallback-polling") {
          setStatus("connecting");
        }
        const network = getNetwork();
        const config = getNetworkConfig(network);
        
        const server = new Horizon.Server(config.horizonUrl);
        
        streamClose = server.transactions()
          .forAccount(getActiveContractId())
          .cursor("now")
          .stream({
            onmessage: (tx) => {
              if (mounted) {
                if (status !== "connected") setStatus("connected");
                // Stop fallback polling if we get a message
                if (fallbackIntervalRef.current) {
                  clearInterval(fallbackIntervalRef.current);
                  fallbackIntervalRef.current = null;
                }
                onUpdateRef.current();
              }
            },
            onerror: (err) => {
              console.error("Event stream error, reconnecting...", err);
              if (mounted) {
                if (streamClose) {
                  streamClose();
                  streamClose = null;
                }
                // Start polling while disconnected
                startFallbackPolling();
                // Attempt to reconnect after 5 seconds
                retryTimeout = setTimeout(attemptConnection, 5000);
              }
            },
          });
          
      } catch (e) {
        console.error("Failed to connect to event stream", e);
        if (mounted) {
          startFallbackPolling();
          retryTimeout = setTimeout(attemptConnection, 5000);
        }
      }
    };

    attemptConnection();

    return () => {
      mounted = false;
      if (streamClose) {
        streamClose();
      }
      if (fallbackIntervalRef.current) {
        clearInterval(fallbackIntervalRef.current);
      }
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [jobId]);

  return { status };
}
