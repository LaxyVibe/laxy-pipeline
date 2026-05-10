# FireCMS TODO 清單（laxy-pipeline / laxy-studio）

更新日期：2026-03-20

## 目前進度（2026-03-20）

- ✅ P0-1 已完成（PromptRepository：Firestore-first + version pin + cache + file fallback）
- 🟡 P0-2 部分完成（backend API 已加 claims/role/tenant 驗權；users/roles 同步機制待補）
- 🟡 P0-3 部分完成（backend API 已自動寫 audit；prompt before/after diff 待補）
- 🟡 P0-4 部分完成（session/payload tenant 封口已加；跨租戶專用測試案例待補）

## 摘要
目前 FireCMS 已進入「管理後台骨架與 collections 已建立」階段，但仍有數個關鍵項目未完成，特別是 Prompt Library 與 backend pipeline 串接、RBAC 端到端封口、Audit Log 自動化與多租戶隔離驗證。

---

## P0（必做：影響可用性與上線）

### 1) Prompt Library 與 pipeline backend 打通
**現況**
- 已改為 Firestore-first（含 fallback），不再僅依賴本地檔。

**TODO**
- [x] 建立 PromptRepository（Firestore 優先、file fallback）。
- [x] 加入版本選擇（version pin：全域/step 級 env）。
- [x] 加入快取（TTL）與失敗回退策略。
- [x] 補單元測試（Firestore 優先、version pin、cache、fallback）。
- [ ] 補真正 Firestore E2E integration test（需 CI/測試專案環境）。

**DoD（驗收）**
- 在 FireCMS 發布新 prompt 後，1 次 pipeline 執行可讀到目標版本。
- Firestore 不可用時，系統可回退到 file 並有明確告警。

### 2) RBAC 端到端封口
**現況**
- backend API 已新增 Firebase token 驗證 + role/tenant gate（`super-admin/client-admin/client-editor`）。

**TODO**
- [ ] 建立 Firebase Auth custom claims 與 users/roles 同步機制。
- [x] Firestore rules + Storage rules 強制 tenant/role 隔離（既有規則保留）。
- [x] 後端 API 二次驗權，避免只靠前端顯示控制。

**DoD（驗收）**
- 非授權角色在 UI、Firestore、Storage、後端 API 全部被拒絕。
- 權限拒絕事件可被追蹤（含 actor、tenant、resource）。

### 3) Audit Log 自動化與防篡改
**TODO**
- [x] 主要 backend endpoint 操作與拒絕事件已自動寫入 audit logs。
- [ ] 補 prompt/設定變更的 before/after diff。
- [x] 限制一般管理員刪改稽核紀錄（Firestore rules: write=false）。

**DoD（驗收）**
- 任一 prompt 變更可完整回溯操作人、時間、差異內容。

### 4) 多租戶資料隔離
**TODO**
- [x] pipeline start payload 會補 tenant scope 並檢查 mismatch。
- [x] resume/status/publish/audio 會檢查 session tenant 與 claim tenant 一致。
- [ ] 補 cross-tenant 專項測試案例（目前僅一般單元測試）。

**DoD（驗收）**
- tenant A 任何身分均無法讀寫 tenant B 資料。

---

## P1（重要：影響穩定性與維運）

### 5) Collection schema 與資料完整性
**TODO**
- promptLibrary 欄位補齊：status、version、model、updatedBy、publishedAt。
- 設定必填/enum/長度限制與預設值。
- createdAt/updatedAt metadata 規範一致化。

### 6) 查詢索引與效能
**TODO**
- 針對常用條件建立 composite indexes（tenantId + updatedAt、tenantId + status）。
- 建立並納入 firestore.indexes.json 部署流程。

### 7) 發布流程治理（Draft → Review → Publish）
**TODO**
- 定義狀態流轉規則與角色限制（誰可 review/publish）。
- 建立快速回滾上一版機制。

### 8) 錯誤監控與告警
**TODO**
- 將 FireCMS 操作失敗、同步失敗、permission-denied 接入監控。
- 設定告警門檻與通知路徑。

---

## P2（可後補：產品化）

### 9) Roadmap 項目落地（Dashboard / Usage / Analytics）
**TODO**
- 將 FIRECMS_DEVELOPMENT_PLAN.md 的 Phase 2/3 拆成可追蹤 issue。
- 每項補 DoD 與驗收測試案例。

### 10) 文件同步
**TODO**
- 更新規劃文件中過時段落（例如「尚未安裝」描述）。
- 補齊本地開發、權限模型、部署步驟與故障排查。

---

## 建議快速掃描指令

```bash
rg -n "TODO|FIXME|FireCMS|promptLibrary|buildPermissionsFor|claim|RBAC|audit" \
  laxy-studio functions FIRECMS_DEVELOPMENT_PLAN.md
```

```bash
rg -n "_load_prompt|pipeline_agent|prompt" functions
```

---

## 建議執行順序（兩週內）
1. P0-1 PromptRepository 串接 + fallback + integration test
2. P0-2 RBAC claims/rules/API 三層封口
3. P0-3 Audit log 全事件自動化
4. P0-4 多租戶隔離測試補齊
5. P1 索引、監控與文件收斂
