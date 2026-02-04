// location.js - 위치 안내 및 네비게이션

// 지역 진입 연출 표시
function showLocationAnnounce(districtName, dongName = null, subtitle = null) {
    const overlay = document.getElementById('locationAnnounce');
    const districtEl = document.getElementById('announceDistrict');
    const dongEl = document.getElementById('announceDong');
    const subtitleEl = document.getElementById('announceSubtitle');

    // 텍스트 설정
    districtEl.textContent = districtName;
    dongEl.textContent = dongName || '';
    subtitleEl.textContent = subtitle || '추정 발원지 도착';

    // 동 이름이 없으면 숨김
    dongEl.style.display = dongName ? 'block' : 'none';

    // 애니메이션 리셋
    districtEl.style.animation = 'none';
    dongEl.style.animation = 'none';
    subtitleEl.style.animation = 'none';

    // 리플로우 강제
    void districtEl.offsetWidth;

    // 애니메이션 재시작
    districtEl.style.animation = 'locationZoomIn 0.6s ease-out forwards';
    dongEl.style.animation = 'locationFadeIn 0.5s ease-out 0.3s forwards';
    subtitleEl.style.animation = 'locationFadeIn 0.5s ease-out 0.5s forwards';

    // 표시
    overlay.classList.add('visible');

    // 2.5초 후 페이드아웃
    setTimeout(() => {
        overlay.classList.remove('visible');
    }, 2500);
}

// 특정 구/동으로 이동 (발원지 클릭 시)
function navigateToDistrict(districtName, dongName = null) {
    // 역추적선 숨기기
    selectedSensorForTraceback = null;
    d3.selectAll('.traceback-group *').remove();

    // 바람 애니메이션 중지
    stopWindAnimation();

    document.getElementById('backButton').classList.remove('visible');

    const container = document.getElementById('seoulMap');
    const svg = d3.select(container).select('svg');
    const g = svg.select('g');
    const width = container.clientWidth || 800;
    const height = Math.max(container.clientHeight, 500);

    // 1단계: 현재 동 지도를 축소하면서 빠져나오기 (슈우욱~)
    g.transition()
        .duration(700)
        .ease(d3.easeCubicInOut)
        .attr('transform', `translate(${width/2}, ${height/2}) scale(0.1)`)
        .on('end', () => {
            // 전체 지도 렌더링
            renderMap();
            selectedDong = null;

            // 새 지도는 처음에 축소 상태에서 시작
            const newSvg = d3.select('#seoulMap svg');
            const newG = newSvg.select('.map-group');

            newG.attr('transform', `translate(${width/2}, ${height/2}) scale(0.1)`);

            // 전체 지도가 펼쳐지는 애니메이션
            newG.transition()
                .duration(600)
                .ease(d3.easeCubicOut)
                .attr('transform', 'translate(0,0) scale(1)')
                .on('end', () => {
                    // 2단계: 해당 구로 줌인 (슈우욱~)
                    setTimeout(() => {
                        const targetFeature = geoData.features.find(f => f.properties.name === districtName);
                        if (!targetFeature) return;

                        const targetElement = document.querySelector(`.district-path[data-district="${districtName}"]`);
                        if (!targetElement) return;

                        selectedDistrict = districtName;
                        // 발원지 이동 시에는 특별 자막 표시
                        pendingLocationSubtitle = '추정 발원지 도착';

                        // 동 정보가 있으면 구 줌인 후 동으로 이동 예약
                        if (dongName) {
                            pendingDongNavigation = dongName;
                        }

                        zoomIntoDistrict(targetElement, targetFeature);
                    }, 200);
                });
        });
}
