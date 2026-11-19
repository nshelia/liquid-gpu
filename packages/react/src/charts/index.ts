/**
 * Charts: Swift Charts–style BarChart / LineChart / AreaChart / PieChart, plus Metric (KPI tile) and Sparkline.
 * All props are JSON-serialisable (data as plain rows, keys as strings) so they can back a generative-UI catalog.
 */
export { BarChart, LineChart, AreaChart, type BarChartProps, type LineChartProps, type AreaChartProps } from './Cartesian';
export { PieChart, type PieChartProps } from './PieChart';
export { Metric, Sparkline, type MetricProps, type SparklineProps } from './Metric';
export { chartPalette, seriesColor, resolveColor as resolveChartColor, type ChartAxis, type ChartRule, type ChartBaseProps } from './shared';
export {
  niceTicks,
  niceStep,
  linearScale,
  bandScale,
  stack,
  linePath,
  areaPath,
  sectorPath,
  pieAngles,
  formatValue,
  extractSeries,
  type AxisFormat,
  type Interpolation,
  type Datum,
} from './scale';
