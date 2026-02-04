// http-status.js - HTTP 상태 모니터링

// HTTP 상태 확인
async function checkHttpStatus() {
    const httpStatusEl = document.getElementById('httpStatus');
    const httpStatusText = document.getElementById('httpStatusText');
    const httpLatency = document.getElementById('httpLatency');

    const testUrl = `${SDOT_API_BASE}/${SDOT_API_KEY}/json/${SDOT_SERVICE}/1/1`;
    const startTime = performance.now();

    try {
        const response = await fetch(testUrl, {
            method: 'GET',
            cache: 'no-cache'
        });

        const endTime = performance.now();
        const latency = Math.round(endTime - startTime);

        if (response.ok) {
            const data = await response.json();
            if (data[SDOT_SERVICE] && data[SDOT_SERVICE].RESULT.CODE === 'INFO-000') {
                // 정상 응답
                httpStatusEl.className = 'http-status ok';
                httpStatusText.textContent = `HTTP ${response.status} OK`;
                httpLatency.textContent = `(${latency}ms)`;

                // 응답 속도에 따른 상태 표시
                if (latency > 2000) {
                    httpStatusEl.className = 'http-status slow';
                    httpStatusText.textContent = `HTTP ${response.status} SLOW`;
                }
            } else {
                // API 에러 응답
                httpStatusEl.className = 'http-status error';
                const errCode = data[SDOT_SERVICE]?.RESULT?.CODE || 'ERR';
                httpStatusText.textContent = `API ${errCode}`;
                httpLatency.textContent = `(${latency}ms)`;
            }
        } else {
            // HTTP 에러
            httpStatusEl.className = 'http-status error';
            httpStatusText.textContent = `HTTP ${response.status}`;
            httpLatency.textContent = `ERROR`;
        }
    } catch (error) {
        // 네트워크 에러
        httpStatusEl.className = 'http-status error';
        httpStatusText.textContent = 'OFFLINE';
        httpLatency.textContent = '(연결 실패)';
    }
}
