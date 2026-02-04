// wind.js - 바람 애니메이션

// 바람 파티클 애니메이션 관련 변수
let windParticles = [];
let windAnimationId = null;
let currentWindGroup = null;

// 풍향을 텍스트로 변환
function getWindDirectionText(degrees) {
    const directions = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
}

// 통합 바람 파티클 애니메이션
function startWindAnimation(options) {
    const { container, mode, width, height, scale, districtFeature } = options;
    // mode: 'city' | 'district' | 'overlay'

    stopWindAnimation();
    currentWindGroup = container.append('g').attr('class', 'wind-particles');

    const config = {
        city: { numParticles: 80, sizeMin: 1.5, sizeMax: 3.5, speedMin: 0.5, speedMax: 2.0, opacityMin: 0.3, opacityMax: 0.7 },
        district: { numParticles: 60, sizeMin: 1, sizeMax: 3, speedMin: 0.5, speedMax: 2.0, opacityMin: 0.3, opacityMax: 0.7 },
        overlay: { numParticles: 400, sizeMin: 3, sizeMax: 7, speedMin: 0.5, speedMax: 1.5, opacityMin: 0.5, opacityMax: 0.9 }
    }[mode] || config.district;

    windParticles = [];

    if (mode === 'overlay' && districtFeature && scale) {
        const bounds = mapPath.bounds(districtFeature);
        const cx = (bounds[0][0] + bounds[1][0]) / 2;
        const cy = (bounds[0][1] + bounds[1][1]) / 2;
        const areaWidth = (width / scale) * 10;
        const areaHeight = (height / scale) * 10;
        const startX = cx - areaWidth / 2;
        const startY = cy - areaHeight / 2;

        for (let i = 0; i < config.numParticles; i++) {
            windParticles.push({
                x: startX + Math.random() * areaWidth,
                y: startY + Math.random() * areaHeight,
                speed: (config.speedMin + Math.random() * (config.speedMax - config.speedMin)) / scale,
                size: (config.sizeMin + Math.random() * (config.sizeMax - config.sizeMin)) / scale,
                opacity: config.opacityMin + Math.random() * (config.opacityMax - config.opacityMin),
                areaWidth, areaHeight, startX, startY
            });
        }
    } else {
        for (let i = 0; i < config.numParticles; i++) {
            windParticles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                speed: config.speedMin + Math.random() * (config.speedMax - config.speedMin),
                size: config.sizeMin + Math.random() * (config.sizeMax - config.sizeMin),
                opacity: config.opacityMin + Math.random() * (config.opacityMax - config.opacityMin)
            });
        }
    }

    // 파티클 SVG 요소 생성
    const circles = currentWindGroup.selectAll('circle.wind-particle')
        .data(windParticles)
        .enter()
        .append('circle')
        .attr('class', 'wind-particle')
        .attr('r', d => d.size)
        .attr('opacity', d => d.opacity);

    if (mode === 'overlay') {
        circles.attr('fill', 'rgba(0, 217, 255, 0.8)');
    }

    // 애니메이션 루프
    function animate() {
        const radians = (windData.direction - 180) * Math.PI / 180;

        if (mode === 'overlay') {
            const baseSpeed = (windData.speed || 2) * 0.15 / scale;
            windParticles.forEach(p => {
                p.x += Math.sin(radians) * baseSpeed * p.speed * 10;
                p.y -= Math.cos(radians) * baseSpeed * p.speed * 10;
                if (p.x < p.startX) p.x = p.startX + p.areaWidth;
                if (p.x > p.startX + p.areaWidth) p.x = p.startX;
                if (p.y < p.startY) p.y = p.startY + p.areaHeight;
                if (p.y > p.startY + p.areaHeight) p.y = p.startY;
            });
        } else {
            const speedFactor = windData.speed * 0.8;
            windParticles.forEach(p => {
                p.x += Math.sin(radians) * p.speed * speedFactor;
                p.y -= Math.cos(radians) * p.speed * speedFactor;
                if (p.x < 0) p.x = width;
                if (p.x > width) p.x = 0;
                if (p.y < 0) p.y = height;
                if (p.y > height) p.y = 0;
            });
        }

        currentWindGroup.selectAll('circle.wind-particle')
            .data(windParticles)
            .attr('cx', d => d.x)
            .attr('cy', d => d.y);

        windAnimationId = requestAnimationFrame(animate);
    }

    animate();
}

// 바람 애니메이션 중지
function stopWindAnimation() {
    if (windAnimationId) {
        cancelAnimationFrame(windAnimationId);
        windAnimationId = null;
    }
    if (currentWindGroup) {
        currentWindGroup.remove();
        currentWindGroup = null;
    }
}

// 하위 호환용 래퍼 함수
function startWindAnimationForCity(g, width, height) {
    startWindAnimation({ container: g, mode: 'city', width, height });
}

function startWindAnimationForOverlay(dongGroup, districtFeature, scale, viewWidth, viewHeight) {
    startWindAnimation({ container: dongGroup, mode: 'overlay', width: viewWidth, height: viewHeight, scale, districtFeature });
}

// 풍향 표시기 업데이트 (정보 패널)
function updateWindIndicator() {
    const infoWindDir = document.getElementById('infoWindDir');
    const infoWindSpeed = document.getElementById('infoWindSpeed');
    const infoWindArrow = document.getElementById('infoWindArrow');
    if (infoWindDir) {
        infoWindDir.textContent = `${getWindDirectionText(windData.direction)}풍`;
    }
    if (infoWindSpeed) {
        infoWindSpeed.textContent = `${windData.speed.toFixed(1)} m/s`;
    }
    if (infoWindArrow) {
        infoWindArrow.setAttribute('transform', `rotate(${windData.direction + 180})`);
    }
}
