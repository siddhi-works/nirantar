"""Faithful dump of ABHA_Two_Patient_HIS.xlsx -> src/server-mock/data/his.json

Nothing is interpreted here. Dates become ISO strings, every row keeps its sheet/row
locator so the UI can cite "P1_Prescription!A6:F6". Parsing into facts happens in
src/server-mock/parse.ts so the extraction logic is testable TypeScript.
"""
import json
import datetime as dt
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "source" / "ABHA_Two_Patient_HIS.xlsx"
OUT = ROOT / "src" / "server-mock" / "data" / "his.json"


def iso(v):
    if isinstance(v, (dt.datetime, dt.date)):
        return v.strftime("%Y-%m-%d")
    return v


def find_header_row(ws, first_cell="Visit"):
    for r in range(1, ws.max_row + 1):
        if ws.cell(r, 1).value == first_cell:
            return r
    raise ValueError(f"header row not found in {ws.title}")


def table(ws, columns):
    """Rows under the 'Visit' header until the first blank visit cell."""
    h = find_header_row(ws)
    rows = []
    r = h + 1
    while ws.cell(r, 1).value is not None and isinstance(ws.cell(r, 1).value, (int, float)):
        row = {"row": r, "sheet": ws.title}
        for i, key in enumerate(columns, start=1):
            row[key] = iso(ws.cell(r, i).value)
        rows.append(row)
        r += 1
    return rows


def main():
    wb = openpyxl.load_workbook(SRC)
    data = {"source": SRC.name, "patients": [], "prescriptions": {}, "diagnostics": {}, "trends": {},
            "aiSummary": {}, "medVsTrend": {}, "notes": {}}

    ws = wb["Patients"]
    hdr = [c.value for c in ws[1]]
    for r in range(2, ws.max_row + 1):
        if ws.cell(r, 1).value:
            p = {hdr[i]: iso(ws.cell(r, i + 1).value) for i in range(len(hdr))}
            p["row"] = r
            data["patients"].append(p)

    idx = wb["Index"]
    data["notes"]["banner"] = idx["A1"].value
    data["notes"]["indexIntro"] = idx["A4"].value
    for r in range(1, idx.max_row + 1):
        v = idx.cell(r, 1).value
        if isinstance(v, str) and v.startswith("Dummy ABHA IDs"):
            data["notes"]["dataCaveat"] = v

    for p in data["patients"]:
        pid = p["patient_id"]
        rx_cols = ["visit", "date", "co", "investigations", "diagnosis", "advice"]
        data["prescriptions"][pid] = table(wb[f"{pid}_Prescription"], rx_cols)
        data["diagnostics"][pid] = table(wb[f"{pid}_Diagnostic"], rx_cols)
        data["trends"][pid] = table(wb[f"{pid}_Trends"], ["visit", "date", "fbs", "ppbs", "hba1c"])
        data["medVsTrend"][pid] = table(
            wb[f"{pid}_Med_vs_Trend"], ["visit", "date", "medicine", "fbs", "ppbs", "hba1c", "reading"])

        ai = wb[f"{pid}_AI_Summary"]
        texts = []
        watch = None
        for r in range(1, ai.max_row + 1):
            v = ai.cell(r, 1).value
            if v is None:
                continue
            if v == "Watch":
                watch = ai.cell(r, 2).value
            elif r >= 5 and isinstance(v, str):
                texts.append((r, v))
        data["aiSummary"][pid] = {
            "sheet": ai.title, "headline": texts[0][1], "body": texts[1][1], "watch": watch,
            "subtitle": ai["A2"].value,
        }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    print("wrote", OUT, OUT.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
