// script.js - versão corrigida para funcionar com o index.html fornecido
// Usa jQuery para manipulação DOM, Chart.js para visualização.
// Funcionalidades:
// - upload via click e drag&drop
// - parse CSV flexível (várias variações de nomes de coluna)
// - cálculos corretos e exibição de cards + gráficos
// - preview das primeiras linhas

let csvData = [];
let charts = {};
let currentFileName = '';

// --- Parser CSV (robusto) ---
function parseCSV(text) {
    if (!text) return [];
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];

    // Detect header
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const mapIndex = {};
    header.forEach((h, i) => mapIndex[h] = i);

    // possíveis aliases
    const expect = {
        alimento: ['alimento','alimentos','comida','item','produto'],
        quantidade: ['quantidade','qtd','quant','unidades','units'],
        voluntarios: ['voluntarios','voluntário','voluntario','vols','voluntaries','n_voluntarios'],
        voluntario_nome: ['voluntario_nome','nome_voluntario','volunteer_name','nome'],
        marmitas: ['marmitas','marmita','marmitas_distribuidas','marmitas_distribuida'],
        idade: ['idade','age','idades'],
        data: ['data','date','dia']
    };

    function findIndex(arr) {
        for (const a of arr) if (a in mapIndex) return mapIndex[a];
        return -1;
    }

    const idx = {
        alimento: findIndex(expect.alimento),
        quantidade: findIndex(expect.quantidade),
        voluntarios: findIndex(expect.voluntarios),
        voluntario_nome: findIndex(expect.voluntario_nome),
        marmitas: findIndex(expect.marmitas),
        idade: findIndex(expect.idade),
        data: findIndex(expect.data)
    };

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        // Considerar vírgulas entre aspas (simples parser)
        const raw = lines[i];
        const cols = raw.split(',').map(c => c.trim().replace(/^"|"$/g,''));
        const obj = {
            alimento: idx.alimento >= 0 ? (cols[idx.alimento] || '') : '',
            quantidade: idx.quantidade >= 0 ? parseFloat((cols[idx.quantidade] || '0').replace(',', '.')) || 0 : 0,
            voluntarios: idx.voluntarios >= 0 ? parseInt(cols[idx.voluntarios]) || 0 : 0,
            voluntario_nome: idx.voluntario_nome >= 0 ? (cols[idx.voluntario_nome] || '') : '',
            marmitas: idx.marmitas >= 0 ? parseInt(cols[idx.marmitas]) || 0 : 0,
            idade: idx.idade >= 0 ? (cols[idx.idade] !== '' ? parseInt(cols[idx.idade]) : null) : null,
            data: idx.data >= 0 ? (cols[idx.data] || '') : ''
        };
        rows.push(obj);
    }
    return rows;
}

// --- Helpers ---
function safeNum(v){ return isNaN(Number(v)) ? 0 : Number(v); }

function formatDateISO(d){
    if(!d) return null;
    d = d.trim();
    // dd/mm/yyyy
    if (/\d{1,2}\/\d{1,2}\/\d{2,4}/.test(d)){
        const parts = d.split('/');
        let dd = parts[0].padStart(2,'0');
        let mm = parts[1].padStart(2,'0');
        let yyyy = parts[2].length === 2 ? '20' + parts[2] : parts[2];
        return `${yyyy}-${mm}-${dd}`;
    }
    // yyyy-mm-dd
    if(/\d{4}-\d{1,2}-\d{1,2}/.test(d)) return d;
    return null;
}

// --- Estatísticas (assegurando exatidão) ---
function computeStats(rows){
    const stats = {
        totalQuantity: 0,
        totalMarmitas: 0,
        totalVolunteersOcc: 0,
        distinctFoodsSet: new Set(),
        byFood: {},
        byDateMarmitas: {},
        ages: [],
        uniqueVolunteersSet: new Set()
    };

    rows.forEach(r => {
        const quantidade = safeNum(r.quantidade);
        const marmitas = safeNum(r.marmitas);
        const voluntarios = safeNum(r.voluntarios);

        stats.totalQuantity += quantidade;
        stats.totalMarmitas += marmitas;
        stats.totalVolunteersOcc += voluntarios;

        if (r.alimento) {
            stats.distinctFoodsSet.add(r.alimento.toString());
            const key = r.alimento.toString();
            stats.byFood[key] = (stats.byFood[key] || 0) + quantidade;
        }

        const iso = formatDateISO(r.data) || 'sem-data';
        stats.byDateMarmitas[iso] = (stats.byDateMarmitas[iso] || 0) + marmitas;

        if (r.idade !== null && r.idade !== '' && !isNaN(r.idade)) stats.ages.push(Number(r.idade));

        if (r.voluntario_nome && r.voluntario_nome.trim() !== '') {
            stats.uniqueVolunteersSet.add(r.voluntario_nome.trim());
        }
    });

    stats.totalFoods = stats.distinctFoodsSet.size;
    stats.uniqueVolunteers = stats.uniqueVolunteersSet.size;
    return stats;
}

function bucketAges(ages){
    const buckets = {'0-17':0,'18-29':0,'30-44':0,'45-59':0,'60+':0};
    ages.forEach(a => {
        if (a < 18) buckets['0-17']++;
        else if (a < 30) buckets['18-29']++;
        else if (a < 45) buckets['30-44']++;
        else if (a < 60) buckets['45-59']++;
        else buckets['60+']++;
    });
    return buckets;
}

// --- Renderers UI ---
function renderSummaryCards(stats){
    $('#totalAlimentos').text(stats.totalFoods);
    $('#totalQuantidade').text(stats.totalQuantity.toLocaleString());
    $('#totalMarmitas').text(stats.totalMarmitas.toLocaleString());
    $('#totalVoluntarios').text(stats.totalVolunteersOcc.toLocaleString());

    if (stats.uniqueVolunteers > 0) {
        $('#linhaVoluntariosUnicos').show();
        $('#voluntariosUnicos').text(stats.uniqueVolunteers);
    } else {
        $('#linhaVoluntariosUnicos').hide();
    }

    // Top cards (4 principais alimentos)
    const entries = Object.entries(stats.byFood).sort((a,b)=> b[1]-a[1]).slice(0,4);
    const topCards = $('#cartoesTopo');
    topCards.empty();
    if (entries.length === 0){
        topCards.append(`<div class="card-item"><div class="small">Sem dados</div></div>`);
    } else {
        entries.forEach(e=>{
            const name = e[0];
            const qty = e[1];
            topCards.append(`<div class="card-item">
                <div class="small">${name}</div>
                <div class="big">${qty.toLocaleString()}</div>
                <div class="small text-muted">unidades doadas</div>
            </div>`);
        });
    }
}

function renderPreview(rows){
    const tbody = $('#tabelaPreview tbody');
    tbody.empty();
    rows.slice(0,10).forEach(r=>{
        tbody.append(`<tr>
            <td>${r.alimento || ''}</td>
            <td>${r.quantidade || 0}</td>
            <td>${r.voluntarios || ''}</td>
            <td>${r.marmitas || ''}</td>
            <td>${r.idade ?? ''}</td>
            <td>${r.data || ''}</td>
        </tr>`);
    });
}

function prepareTimeseries(byDateObj){
    const entries = Object.entries(byDateObj).filter(e => e[0] !== 'sem-data');
    entries.sort((a,b)=> new Date(a[0]) - new Date(b[0]));
    const labels = entries.map(e=>e[0]);
    const values = entries.map(e=>e[1]);
    if (byDateObj['sem-data']) { labels.push('sem data'); values.push(byDateObj['sem-data']); }
    return {labels, values};
}

function safeDestroy(chart){
    try { if (chart && chart.destroy) chart.destroy(); } catch(e){}
}

function renderCharts(stats){
    // Timeseries
    const ts = prepareTimeseries(stats.byDateMarmitas);
    safeDestroy(charts.timeseries);
    const ctx1 = $('#graficoLinha')[0].getContext('2d');
    charts.timeseries = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: ts.labels,
            datasets: [{
                label: 'Marmitas',
                data: ts.values,
                borderColor: '#f39c12',
                backgroundColor: 'rgba(243,156,18,0.12)',
                fill: true,
                tension: 0.2,
                pointRadius: 2
            }]
        },
        options: {
            plugins:{ legend:{ display:false } },
            scales:{
                x:{ ticks:{ color:'#4b5563' } },
                y:{ ticks:{ color:'#4b5563', beginAtZero:true } }
            },
            maintainAspectRatio:false
        }
    });

    // Age distribution
    const ageBuckets = bucketAges(stats.ages);
    const ageLabels = Object.keys(ageBuckets);
    const ageValues = Object.values(ageBuckets);
    safeDestroy(charts.age);
    const ctx2 = $('#graficoIdades')[0].getContext('2d');
    charts.age = new Chart(ctx2, {
        type:'bar',
        data:{
            labels: ageLabels,
            datasets:[{
                label:'Pessoas',
                data: ageValues,
                backgroundColor: '#9ca3af'
            }]
        },
        options:{
            plugins:{ legend:{ display:false } },
            scales:{
                x:{ ticks:{ color:'#4b5563' } },
                y:{ ticks:{ color:'#4b5563', beginAtZero:true } }
            },
            maintainAspectRatio:false
        }
    });

    // Top foods (horizontal)
    const topFoods = Object.entries(stats.byFood).sort((a,b)=> b[1]-a[1]).slice(0,8);
    const foodLabels = topFoods.map(e=>e[0]);
    const foodValues = topFoods.map(e=>e[1]);
    safeDestroy(charts.topFoods);
    const ctx3 = $('#graficoAlimentos')[0].getContext('2d');
    charts.topFoods = new Chart(ctx3, {
        type:'bar',
        data:{
            labels: foodLabels,
            datasets:[{
                label:'Quantidade',
                data: foodValues,
                backgroundColor:'#d1d5db'
            }]
        },
        options:{
            indexAxis:'y',
            plugins:{ legend:{ display:false } },
            scales:{
                x:{ ticks:{ color:'#4b5563', beginAtZero:true } },
                y:{ ticks:{ color:'#4b5563' } }
            },
            maintainAspectRatio:false
        }
    });
}

// --- UI summary (file meta) ---
function updateFileMeta(rows){
    $('#nomeArquivo').text(currentFileName || 'Arquivo carregado');
    $('#qtdLinhas').text(rows.length + ' linhas processadas');
}

// --- Upload handlers e eventos ---
$(function(){
    const uploadArea = document.getElementById('areaUpload');
    const fileInput = document.getElementById('arquivoCSV');

    // click area open file dialog
    uploadArea.addEventListener('click', () => fileInput.click());

    // when selecting file
    fileInput.addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (!f) return;
        currentFileName = f.name;
        const reader = new FileReader();
        reader.onload = function(ev){
            try {
                csvData = parseCSV(ev.target.result);
                $('#botaoLimpar').show();
                $('#areaUpload').addClass('loaded').html('<p>📊 Arquivo carregado: ' + currentFileName + '</p>');
                const stats = computeStats(csvData);
                renderSummaryCards(stats);
                renderPreview(csvData);
                renderCharts(stats);
                updateFileMeta(csvData);
            } catch(err){
                alert('Erro ao processar CSV: ' + err.message);
            }
        };
        reader.readAsText(f,'UTF-8');
    });

    // clear
    $('#botaoLimpar').on('click', ()=>{
        csvData = [];
        currentFileName = '';
        $('#arquivoCSV').val('');
        $('#botaoLimpar').hide();
        $('#areaUpload').removeClass('loaded').html('<p>Arraste seu CSV</p><small class="hint">Formato: alimento,quantidade,voluntarios,marmitas,idade,data</small>');
        $('#nomeArquivo').text('Nenhum arquivo');
        $('#qtdLinhas').text('');
        $('#tabelaPreview tbody').empty();
        $('#totalAlimentos').text('-');
        $('#totalQuantidade').text('-');
        $('#totalMarmitas').text('-');
        $('#totalVoluntarios').text('-');
        $('#linhaVoluntariosUnicos').hide();
        $('#cartoesTopo').empty();
        Object.values(charts).forEach(c => safeDestroy(c));
        charts = {};
    });

    // Drag & drop
    uploadArea.addEventListener('dragover', (e)=>{
        e.preventDefault(); e.stopPropagation();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', (e)=>{
        e.preventDefault(); e.stopPropagation();
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e)=>{
        e.preventDefault(); e.stopPropagation();
        uploadArea.classList.remove('dragover');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0){
            fileInput.files = e.dataTransfer.files;
            const ev = new Event('change');
            fileInput.dispatchEvent(ev);
        }
    });

    // accessibility: Enter or Space triggers
    uploadArea.addEventListener('keypress', (e)=>{
        if (e.key === 'Enter' || e.key === ' ') fileInput.click();
    });
});
