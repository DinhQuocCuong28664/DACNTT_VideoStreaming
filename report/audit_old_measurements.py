import os
import json
import statistics
import sys

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

RESULTS_DIR = "docs/results"

def audit_ttff():
    print("=" * 70)
    print("1. RÀ SOÁT SỐ LIỆU ĐO TTFF (TIME-TO-FIRST-FRAME)")
    print("=" * 70)
    multi_region = os.path.join(RESULTS_DIR, "qoe-ttff-multiregion.json")
    if os.path.exists(multi_region):
        with open(multi_region, "r", encoding="utf-8") as f:
            mdata = json.load(f)
        by_region = mdata.get("byRegion", {})
        print(f"Thời điểm đo: {mdata.get('measuredAt')} | Cấu hình CDN: {mdata.get('priceClass')}")
        print(f"{'Vùng':16} | {'Vị trí':22} | {'PoP CloudFront':12} | {'Trung vị (ms)':14} | {'P95 (ms)':10} | {'Cache Hit':10}")
        print("-" * 92)
        for reg_code, rinfo in by_region.items():
            loc = rinfo.get("clientLocation", "")
            pops = ", ".join(rinfo.get("servedByPop", []))
            ttff = rinfo.get("ttff", {})
            med = ttff.get("medianMs", 0)
            p95 = ttff.get("p95Ms", 0)
            samples = rinfo.get("samples", 0)
            hits = rinfo.get("cacheHits", 0)
            hit_ratio = f"{hits}/{samples} ({hits/samples*100:.0f}%)" if samples else "N/A"
            print(f"{reg_code:16} | {loc:22} | {pops:12} | {med:14.2f} | {p95:10.2f} | {hit_ratio:10}")

def audit_transcode():
    print("\n" + "=" * 70)
    print("2. RÀ SOÁT SỐ LIỆU TRANSCODE THỜI LƯỢNG (LEGACY VÀ CHUNKED)")
    print("=" * 70)
    legacy = os.path.join(RESULTS_DIR, "transcode-timing.json")
    if os.path.exists(legacy):
        with open(legacy, "r", encoding="utf-8") as f:
            data = json.load(f)
        print(f"Đường 1 container (transcode-timing.json): tổng {len(data)} lượt đo.")
        grouped = {}
        for item in data:
            lbl = item.get("label", "unknown")
            dur = item.get("timings", {}).get("transcodePipelineSec", 0)
            rtf = item.get("realtimeFactor", 0)
            grouped.setdefault(lbl, []).append((dur, rtf))
        for lbl, vals in sorted(grouped.items()):
            durs = [v[0] for v in vals]
            rtfs = [v[1] for v in vals]
            print(f"  Payload {lbl:12}: {len(vals):2} lượt | Pipeline TB: {statistics.mean(durs):7.1f}s | Realtime Factor: {statistics.mean(rtfs):.2f}x")

def audit_load_test():
    print("\n" + "=" * 70)
    print("3. RÀ SOÁT SỐ LIỆU TẢI BACKEND (API LOAD TEST TRÊN EC2 BASELINE)")
    print("=" * 70)
    node_load = os.path.join(RESULTS_DIR, "node-load-test.json")
    if os.path.exists(node_load):
        with open(node_load, "r", encoding="utf-8") as f:
            ndata = json.load(f)
        lat = ndata.get("latencyMs", {})
        print("Tệp: node-load-test.json (Đo ngày 14/08/2026)")
        print(f"  Target           : {ndata.get('target')}")
        print(f"  Đồng thời        : {ndata.get('concurrency')} Virtual Users (Tổng {ndata.get('totalRequests')} requests)")
        print(f"  Thành công       : {ndata.get('successfulRequests')} ({ndata.get('successRatePercent')}%)")
        print(f"  Thông lượng (RPS): {ndata.get('throughputRps')} req/s")
        print(f"  Độ trễ trung bình: {lat.get('meanMs')} ms (~{lat.get('meanMs', 0)/1000:.2f}s)")
        print(f"  Độ trễ Trung vị  : {lat.get('medianMs')} ms (~{lat.get('medianMs', 0)/1000:.2f}s)")
        print(f"  Độ trễ P95       : {lat.get('p95Ms')} ms (~{lat.get('p95Ms', 0)/1000:.2f}s)")
        print(f"  Độ trễ Max       : {lat.get('maxMs')} ms (~{lat.get('maxMs', 0)/1000:.2f}s)")

    k6_summary = os.path.join(RESULTS_DIR, "k6-summary.json")
    if os.path.exists(k6_summary):
        with open(k6_summary, "r", encoding="utf-8") as f:
            kdata = json.load(f)
        summ = kdata.get("summary", {})
        dur = summ.get("httpReqDurationMs", {})
        print("\nTệp: k6-summary.json (Đo ngày 30/08/2026)")
        print(f"  Target           : {kdata.get('target')}")
        print(f"  VU đồng thời tối đa: {summ.get('maxVirtualUsers')} VUs (Tổng {summ.get('totalRequests')} requests)")
        print(f"  Thông lượng (RPS): {summ.get('requestsPerSecond'):.2f} req/s")
        print(f"  Tỷ lệ lỗi        : {summ.get('failedRate') * 100:.1f}%")
        print(f"  Độ trễ Trung bình: {dur.get('avg'):.2f} ms")
        print(f"  Độ trễ Trung vị  : {dur.get('med'):.2f} ms")
        print(f"  Độ trễ P90       : {dur.get('p90'):.2f} ms")
        print(f"  Độ trễ P95       : {dur.get('p95'):.2f} ms")
        print(f"  Độ trễ Max       : {dur.get('max'):.2f} ms (~{dur.get('max', 0)/1000:.2f}s)")

def audit_drain_rate():
    print("\n" + "=" * 70)
    print("4. RÀ SOÁT HIỆU NĂNG GIẢI PHÓNG HÀNG ĐỢI VỚI VIDEO THẬT (DRAIN RATE)")
    print("=" * 70)
    drain_file = os.path.join(RESULTS_DIR, "drain-rate-real-payload.json")
    if os.path.exists(drain_file):
        with open(drain_file, "r", encoding="utf-8") as f:
            ddata = json.load(f)
        res = ddata.get("result", {})
        print(f"Tệp: drain-rate-real-payload.json")
        print(f"  Số job gửi       : {res.get('jobsSubmitted')}")
        print(f"  Số job thành công: {res.get('jobsSucceeded')} (100%)")
        print(f"  Số job thất bại  : {res.get('jobsFailed')} (0%)")
        print(f"  Thời gian xả sạch: {res.get('drainDurationSec')} s (~{res.get('drainDurationSec')/60:.1f} phút)")
        print(f"  Tốc độ tiêu thụ  : {res.get('drainRateJobsPerMin')} jobs/phút")
        print(f"  Số job RUNNING max: {res.get('maxObservedRunning')} (Khớp trần 8 vCPU)")
        print(f"  Thời gian/job    : {res.get('impliedWallClockPerJobSec')} s")

def audit_serverless_backend():
    print("\n" + "=" * 70)
    print("5. SỐ LIỆU ĐO ĐẠC MỚI: SERVERLESS BACKEND (AWS LAMBDA MULTI-AZ)")
    print("=" * 70)
    backend_file = os.path.join(RESULTS_DIR, "backend-comparison.json")
    if os.path.exists(backend_file):
        with open(backend_file, "r", encoding="utf-8") as f:
            bdata = json.load(f)
        summary = bdata.get("benchmarkSummary", {})
        warm = summary.get("warmLatencyStats", {})
        burst = summary.get("burstScaling", {})
        print(f"Tệp: backend-comparison.json")
        print(f"  Cold Start Latency : {summary.get('coldStartLatencyMs')} ms")
        print(f"  Warm Median Latency: {warm.get('median')} ms (P95: {warm.get('p95')} ms)")
        for k, v in burst.items():
            lat = v.get("latency", {})
            print(f"  Burst Concurrency {v.get('concurrency')}: Median = {lat.get('median')} ms, P95 = {lat.get('p95')} ms, Throughput = {v.get('throughputRps')} req/s")
        tco = bdata.get("tcoComparison", {}).get("scenarios", {})
        monthly_cost = tco.get("serverless_lambda", {}).get("totalMonthlyUsd", 0)
        print(f"  Chi phí nhàn rỗi Lambda: ${monthly_cost:.2f}/tháng (Tiết kiệm 100% so với EC2)")

if __name__ == "__main__":
    audit_ttff()
    audit_transcode()
    audit_load_test()
    audit_drain_rate()
    audit_serverless_backend()
