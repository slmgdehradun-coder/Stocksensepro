'use client';

import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, Time, LineStyle } from 'lightweight-charts';
import { Candle } from '@/lib/dataFetcher';

interface ChartProps {
  data: Candle[];
  indicators: any;
  patterns: any[];
  height?: number;
}

export default function StockChart({ data, indicators, patterns, height }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sma50SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const sma200SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const vwapSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbUpperSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbMiddleSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const bbLowerSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const supportResistanceRefs = useRef<ISeriesApi<"Line">[]>([]);
  const rsiSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiUpperRef = useRef<ISeriesApi<"Line"> | null>(null);
  const rsiLowerRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const signalSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const macdHistogramRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chartHeight = height || 700;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#1e293b' },
        textColor: '#cbd5e1',
      },
      grid: {
        vertLines: { color: '#334155' },
        horzLines: { color: '#334155' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartHeight,
      timeScale: {
        timeVisible: false,
        secondsVisible: false,
      },
      rightPriceScale: {
        scaleMargins: {
          top: 0.05,
          bottom: 0.4,
        },
      },
    });
    chartRef.current = chart;

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });
    candlestickSeriesRef.current = candlestickSeries;

    const volumeSeries = chart.addHistogramSeries({
      color: '#26a69a',
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });
    volumeSeriesRef.current = volumeSeries;

    chart.priceScale('').applyOptions({
      scaleMargins: {
        top: 0.5,
        bottom: 0.4,
      },
    });

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      ema20SeriesRef.current = null;
      ema50SeriesRef.current = null;
      ema200SeriesRef.current = null;
      sma50SeriesRef.current = null;
      sma200SeriesRef.current = null;
      vwapSeriesRef.current = null;
      bbUpperSeriesRef.current = null;
      bbMiddleSeriesRef.current = null;
      bbLowerSeriesRef.current = null;
      supportResistanceRefs.current = [];
      rsiSeriesRef.current = null;
      rsiUpperRef.current = null;
      rsiLowerRef.current = null;
      macdSeriesRef.current = null;
      signalSeriesRef.current = null;
      macdHistogramRef.current = null;
    };
  }, [height]); // Only recreate if height changes

  // Update data and indicators
  useEffect(() => {
    if (!chartRef.current || !candlestickSeriesRef.current || !data || data.length === 0) return;

    const isIntraday = typeof data[0]?.time === 'number';
    chartRef.current.applyOptions({
      timeScale: {
        timeVisible: isIntraday,
      }
    });

    const formattedData = data.map(d => ({
      time: d.time as Time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    candlestickSeriesRef.current.setData(formattedData);

    if (volumeSeriesRef.current) {
      const volumeData = data.map(d => ({
        time: d.time as Time,
        value: d.volume,
        color: d.close >= d.open ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)',
      }));
      volumeSeriesRef.current.setData(volumeData);
    }

    // EMAs
    if (indicators?.ema20) {
      if (!ema20SeriesRef.current) ema20SeriesRef.current = chartRef.current.addLineSeries({ color: '#3b82f6', lineWidth: 2, title: 'EMA 20' });
      const ema20Data = data.slice(data.length - indicators.ema20.length).map((d, i) => ({
        time: d.time as Time,
        value: indicators.ema20[i],
      }));
      ema20SeriesRef.current.setData(ema20Data);
    }

    if (indicators?.ema50) {
      if (!ema50SeriesRef.current) ema50SeriesRef.current = chartRef.current.addLineSeries({ color: '#eab308', lineWidth: 2, title: 'EMA 50' });
      const ema50Data = data.slice(data.length - indicators.ema50.length).map((d, i) => ({
        time: d.time as Time,
        value: indicators.ema50[i],
      }));
      ema50SeriesRef.current.setData(ema50Data);
    }

    if (indicators?.ema200) {
      if (!ema200SeriesRef.current) ema200SeriesRef.current = chartRef.current.addLineSeries({ color: '#a855f7', lineWidth: 2, title: 'EMA 200' });
      const ema200Data = data.slice(data.length - indicators.ema200.length).map((d, i) => ({
        time: d.time as Time,
        value: indicators.ema200[i],
      }));
      ema200SeriesRef.current.setData(ema200Data);
    }

    if (indicators?.sma50) {
      if (!sma50SeriesRef.current) sma50SeriesRef.current = chartRef.current.addLineSeries({ color: '#f97316', lineWidth: 1, title: 'SMA 50' });
      const sma50Data = data.slice(data.length - indicators.sma50.length).map((d, i) => ({
        time: d.time as Time,
        value: indicators.sma50[i],
      }));
      sma50SeriesRef.current.setData(sma50Data);
    }

    if (indicators?.sma200) {
      if (!sma200SeriesRef.current) sma200SeriesRef.current = chartRef.current.addLineSeries({ color: '#94a3b8', lineWidth: 1, title: 'SMA 200' });
      const sma200Data = data.slice(data.length - indicators.sma200.length).map((d, i) => ({
        time: d.time as Time,
        value: indicators.sma200[i],
      }));
      sma200SeriesRef.current.setData(sma200Data);
    }

    if (indicators?.vwap) {
      if (!vwapSeriesRef.current) vwapSeriesRef.current = chartRef.current.addLineSeries({ color: '#14b8a6', lineWidth: 2, title: 'VWAP' });
      const vwapData = data.slice(data.length - indicators.vwap.length).map((d, i) => ({
        time: d.time as Time,
        value: indicators.vwap[i],
      }));
      vwapSeriesRef.current.setData(vwapData);
    }

    if (indicators?.bb && indicators.bb.length > 0) {
      if (!bbUpperSeriesRef.current) bbUpperSeriesRef.current = chartRef.current.addLineSeries({ color: 'rgba(56, 189, 248, 0.65)', lineWidth: 1, title: 'BB Upper' });
      if (!bbMiddleSeriesRef.current) bbMiddleSeriesRef.current = chartRef.current.addLineSeries({ color: 'rgba(56, 189, 248, 0.35)', lineWidth: 1, title: 'BB Mid' });
      if (!bbLowerSeriesRef.current) bbLowerSeriesRef.current = chartRef.current.addLineSeries({ color: 'rgba(56, 189, 248, 0.65)', lineWidth: 1, title: 'BB Lower' });
      const bbData = data.slice(data.length - indicators.bb.length);
      bbUpperSeriesRef.current.setData(bbData.map((d, i) => ({ time: d.time as Time, value: indicators.bb[i].upper })));
      bbMiddleSeriesRef.current.setData(bbData.map((d, i) => ({ time: d.time as Time, value: indicators.bb[i].middle })));
      bbLowerSeriesRef.current.setData(bbData.map((d, i) => ({ time: d.time as Time, value: indicators.bb[i].lower })));
    }

    if (chartRef.current && indicators?.supportResistance) {
      supportResistanceRefs.current.forEach(series => chartRef.current?.removeSeries(series));
      supportResistanceRefs.current = [];
      const firstTime = data[0]?.time as Time;
      const lastTime = data[data.length - 1]?.time as Time;
      indicators.supportResistance.slice(0, 6).forEach((level: any) => {
        const series = chartRef.current!.addLineSeries({
          color: level.type === 'support' ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          title: level.type === 'support' ? 'Support' : 'Resistance',
        });
        series.setData([
          { time: firstTime, value: level.price },
          { time: lastTime, value: level.price },
        ]);
        supportResistanceRefs.current.push(series);
      });
    }

    // RSI
    if (indicators?.rsi && indicators.rsi.length > 0) {
      if (!rsiSeriesRef.current && chartRef.current) {
        rsiSeriesRef.current = chartRef.current.addLineSeries({ color: '#a855f7', lineWidth: 2, title: 'RSI', priceScaleId: 'rsi' });
        chartRef.current.priceScale('rsi').applyOptions({ scaleMargins: { top: 0.65, bottom: 0.2 } });
        rsiUpperRef.current = chartRef.current.addLineSeries({ color: '#ef4444', lineWidth: 1, lineStyle: LineStyle.Dashed, priceScaleId: 'rsi' });
        rsiLowerRef.current = chartRef.current.addLineSeries({ color: '#22c55e', lineWidth: 1, lineStyle: LineStyle.Dashed, priceScaleId: 'rsi' });
      }
      if (rsiSeriesRef.current) {
        const rsiData = data.slice(data.length - indicators.rsi.length).map((d, i) => ({
          time: d.time as Time,
          value: indicators.rsi[i],
        }));
        rsiSeriesRef.current.setData(rsiData);
        if (rsiUpperRef.current) rsiUpperRef.current.setData(data.map(d => ({ time: d.time as Time, value: 70 })));
        if (rsiLowerRef.current) rsiLowerRef.current.setData(data.map(d => ({ time: d.time as Time, value: 30 })));
      }
    } else if (rsiSeriesRef.current && chartRef.current) {
      chartRef.current.removeSeries(rsiSeriesRef.current);
      if (rsiUpperRef.current) chartRef.current.removeSeries(rsiUpperRef.current);
      if (rsiLowerRef.current) chartRef.current.removeSeries(rsiLowerRef.current);
      rsiSeriesRef.current = null;
      rsiUpperRef.current = null;
      rsiLowerRef.current = null;
    }

    // MACD
    if (indicators?.macd && indicators.macd.length > 0) {
      if (!macdSeriesRef.current && chartRef.current) {
        macdSeriesRef.current = chartRef.current.addLineSeries({ color: '#3b82f6', lineWidth: 2, title: 'MACD', priceScaleId: 'macd' });
        signalSeriesRef.current = chartRef.current.addLineSeries({ color: '#eab308', lineWidth: 2, title: 'Signal', priceScaleId: 'macd' });
        macdHistogramRef.current = chartRef.current.addHistogramSeries({ priceScaleId: 'macd' });
        chartRef.current.priceScale('macd').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
      }
      if (macdSeriesRef.current && signalSeriesRef.current && macdHistogramRef.current) {
        const macdData = data.slice(data.length - indicators.macd.length).map((d, i) => ({
          time: d.time as Time,
          value: indicators.macd[i].MACD || 0,
        }));
        const signalData = data.slice(data.length - indicators.macd.length).map((d, i) => ({
          time: d.time as Time,
          value: indicators.macd[i].signal || 0,
        }));
        const histData = data.slice(data.length - indicators.macd.length).map((d, i) => {
          const val = indicators.macd[i].histogram || 0;
          return {
            time: d.time as Time,
            value: val,
            color: val >= 0 ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)',
          };
        });
        macdSeriesRef.current.setData(macdData);
        signalSeriesRef.current.setData(signalData);
        macdHistogramRef.current.setData(histData);
      }
    } else if (macdSeriesRef.current && chartRef.current) {
      chartRef.current.removeSeries(macdSeriesRef.current);
      if (signalSeriesRef.current) chartRef.current.removeSeries(signalSeriesRef.current);
      if (macdHistogramRef.current) chartRef.current.removeSeries(macdHistogramRef.current);
      macdSeriesRef.current = null;
      signalSeriesRef.current = null;
      macdHistogramRef.current = null;
    }

    // Markers
    if (patterns && patterns.length > 0) {
      const markers = patterns.map(p => ({
        time: data[p.index].time as Time,
        position: (p.type === 'Bullish' ? 'belowBar' : 'aboveBar') as any,
        color: p.type === 'Bullish' ? '#22c55e' : '#ef4444',
        shape: (p.type === 'Bullish' ? 'arrowUp' : 'arrowDown') as any,
        text: p.name,
      }));
      if (candlestickSeriesRef.current) candlestickSeriesRef.current.setMarkers(markers);
    } else {
      if (candlestickSeriesRef.current) candlestickSeriesRef.current.setMarkers([]);
    }

  }, [data, indicators, patterns]);

  return (
    <div className="w-full rounded-xl overflow-hidden border border-slate-700 shadow-xl">
      <div ref={chartContainerRef} className="w-full" style={{ height: height || 700 }} />
    </div>
  );
}
