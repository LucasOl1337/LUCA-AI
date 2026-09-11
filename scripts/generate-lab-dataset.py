"""Deterministic synthetic telemetry fixtures. Python standard library only."""
import csv
import hashlib
import json
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

OUT = Path(__file__).resolve().parents[1] / 'datasets' / 'laboratorio-virtual-v1'
OUT.mkdir(parents=True, exist_ok=True)
R = 6378137.0
LAT, LON = -22.70, -47.65
def ll(x, y):
    return [round(LON + math.degrees(x / (R * math.cos(math.radians(LAT)))), 8),
            round(LAT + math.degrees(y / R), 8)]
def rect(x1, y1, x2, y2):
    return [ll(x1,y1),ll(x2,y1),ll(x2,y2),ll(x1,y2),ll(x1,y1)]
def save(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# field, unit, origin, real acquisition, semantics
schema = [
 ('timestamp','UTC ISO8601','logger','Relógio do registrador sincronizado por GNSS','Instante na grade de exportação de 100 ms'),
 ('machine_id','texto','cadastro','Cadastro de ativo','Identificador fictício TRATOR-DEMO-001'),
 ('synthetic','boolean','metadado','Manifesto do arquivo','Sempre true; não é sensor'),
 ('latitude_deg','graus','GNSS','Receptor GNSS no trator','Latitude WGS84; vazio sem fix'),
 ('longitude_deg','graus','GNSS','Receptor GNSS no trator','Longitude WGS84; vazio sem fix'),
 ('gnss_fix','texto','GNSS','Mensagem de estado do receptor','3d ou no_fix; não declara RTK'),
 ('gnss_horizontal_accuracy_m','m','GNSS','Estimativa de precisão horizontal do receptor','0.8 m assumido; estimativa, não garantia'),
 ('ground_speed_kmh','km/h','GNSS','Velocidade sobre solo estimada pelo receptor','Vazia sem fix; não é velocidade de roda'),
 ('heading_deg','graus','GNSS_INS','GNSS de duas antenas + IMU e fusão INS','Norte=0; leste=90; orientação mantida pela INS na falha curta'),
 ('roll_deg','graus','IMU_AHRS','Acelerômetro + giroscópio e fusão AHRS','Positivo lado direito desce; referencial corpo x frente y direita z baixo'),
 ('pitch_deg','graus','IMU_AHRS','Acelerômetro + giroscópio e fusão AHRS','Positivo nariz sobe'),
 ('yaw_rate_deg_s','graus/s','giroscopio','Giroscópio instalado no chassi','Componente vertical; curva positiva à direita'),
 ('engine_rpm','rpm','ECU_CAN','Sensor de posição/rotação do virabrequim via ECU','CAN transporta o valor; não é sensor'),
 ('engine_load_pct','%','ECU_CAN_estimativa','Estimativa de carga da ECU do motor','Percentual ilustrativo; conferir definição/escala do fabricante'),
 ('coolant_temp_c','°C','ECU_CAN','Sensor de temperatura do líquido de arrefecimento','Não confundir com temperatura ambiente DHT'),
 ('oil_pressure_kpa','kPa','ECU_CAN','Transdutor de pressão no circuito de lubrificação','Necessita transdutor; interruptor simples não fornece pressão contínua'),
 ('fuel_rate_l_h','L/h','ECU_CAN_estimativa','ECU a partir de comando/calibração de injeção','Estimativa de consumo; não pressupõe medidor de vazão'),
 ('battery_voltage_v','V','ECU_CAN','Conversor ADC da ECU na alimentação elétrica','Tensão do sistema de carga'),
 ('ambient_temp_c','°C','sensor_ambiente','Termômetro digital protegido do sol e calor do motor','Sensor externo; não mede motor'),
 ('relative_humidity_pct','%','sensor_ambiente','Sensor capacitivo de umidade protegido','Umidade relativa ambiente'),
 ('brake_pressed','boolean','ECU_CAN','Interruptor/sensor do pedal de freio','false neste percurso; não prova ausência de mau uso'),
 ('pto_engaged','boolean','ECU_CAN','Estado de engate da tomada de potência na ECU','false: implemento de arrasto sem PTO'),
 ('coolant_warning_active','boolean','ECU_CAN','Estado de aviso do controlador do motor','Simulado com limite didático de 105°C; sem DTC inventado'),
]
save('schema.json', {'version':1,'missing_value':'empty CSV cell','delimiter':',','decimal':'.',
 'encoding':'UTF-8','fields':[dict(zip(['name','unit','origin','real_acquisition','meaning'], x)) for x in schema]})
save('mapa.geojson', {'type':'FeatureCollection','features':[
 {'type':'Feature','properties':{'id':'fence-1','role':'allowed_area','synthetic':True},'geometry':{'type':'Polygon','coordinates':[rect(-95,-80,95,80)]}},
 {'type':'Feature','properties':{'id':'water-1','role':'water','synthetic':True},'geometry':{'type':'Polygon','coordinates':[rect(110,-45,150,45)]}}
]})
cases = [('01-operacao-normal',70),('02-cerca-e-agua',100),('03-aquecimento-e-falha-gps',70)]
manifest = {'version':'1.0','synthetic':True,'machine':{'id':'TRATOR-DEMO-001','model':'Trator genérico diesel 90 kW, sem marca','implement':'Grade de arrasto sem PTO'},
 'duration_s':600,'export_rate_hz':10,'coordinate_reference':'WGS84 / GeoJSON longitude,latitude',
 'local_origin':[LON,LAT],'map_warning':'Origem geográfica apenas para ancoragem. Campo, água e trajetórias são fictícios; não representam a propriedade ou água reais nessa coordenada. Sem imagem de satélite fornecida.',
 'rules':{'water_warning_distance_m':20,'coolant_warning_c':105,'purpose':'Limites didáticos, não limites homologados do fabricante; distância horizontal ao polígono de água; fence inclui borda.'},
 'resampling':'GNSS/INS 10Hz; ECU e ambiente 1Hz mantidos até próxima aquisição (zero-order hold). Exportação a 10Hz não significa sensor ambiente a 10Hz.',
 'causal_labels':'Nenhuma causa mecânica ou culpa de operador é fornecida como verdade. Eventos esperados são separados da telemetria.', 'files':[]}
events = []
for case_index,(name,a) in enumerate(cases):
    rows=[]
    previous={}
    # Smooth closed ellipse: physically compatible speed and heading; no jumps at turns.
    w=2*math.pi/300
    start=datetime(2026,9,9,12+case_index,0,tzinfo=timezone.utc)
    for i in range(6001):
        t=i/10
        theta=w*t+math.pi
        x,y=a*math.cos(theta),60*math.sin(theta)
        vx,vy=-a*w*math.sin(theta),60*w*math.cos(theta)
        ax,ay=-a*w*w*math.cos(theta),-60*w*w*math.sin(theta)
        speed=math.hypot(vx,vy)
        heading=math.degrees(math.atan2(vx,vy))%360
        yaw=math.degrees((vy*ax-vx*ay)/(speed*speed))
        s=int(t)
        hot=case_index==2
        coolant=84+0.8*math.sin(s/40)+(min(max(s-180,0),240)/240*25 if hot else 0)
        gap=hot and 240<=t<243
        lon,lat=ll(x,y)
        vals=[(start+timedelta(seconds=t)).isoformat(timespec='milliseconds').replace('+00:00','Z'),
          'TRATOR-DEMO-001','true',None if gap else lat,None if gap else lon,
          'no_fix' if gap else '3d',None if gap else 0.8,None if gap else round(speed*3.6,3),
          round(heading,3),round(2*math.sin(t/18),3),round(1.5*math.sin(t/27),3),round(yaw,4),
          round(1750+40*math.sin(s/16)),round(58+5*math.sin(s/30),2),round(coolant,2),
          round(410-0.9*(coolant-84)+3*math.sin(s/12),2),round(13+0.7*math.sin(s/30),3),
          round(14.1+0.04*math.sin(s/40),2),round(29+0.2*math.sin(s/120),2),round(63+math.sin(s/90),2),
          'false','false',str(coolant>=105).lower()]
        row=dict(zip([f[0] for f in schema],vals)); rows.append(row)
        distance=math.hypot(max(110-x,0,x-150),max(-45-y,0,y-45))
        conditions={'outside_fence':abs(x)>95 or abs(y)>80,'near_water':distance<=20,
                    'coolant_warning':coolant>=105,'gnss_unavailable':gap}
        for kind,active in conditions.items():
            if active!=previous.get(kind,False):
                events.append({'case':name,'timestamp':row['timestamp'],'elapsed_s':t,'event':kind,
                               'transition':'start' if active else 'end','synthetic':True})
        previous=conditions
    path=OUT/(name+'.csv')
    with path.open('w',encoding='utf-8',newline='') as f:
        writer=csv.DictWriter(f,fieldnames=rows[0]);writer.writeheader();writer.writerows(rows)
    # Read-back checks, including kinematic consistency independent of speed formula.
    with path.open(encoding='utf-8',newline='') as f: reread=list(csv.DictReader(f))
    assert len(reread)==6001 and len({r['timestamp'] for r in reread})==6001
    assert sum(r['latitude_deg']=='' for r in reread)==(30 if hot else 0)
    for j in range(1,len(reread)):
        p,q=reread[j-1],reread[j]
        assert (datetime.fromisoformat(q['timestamp'])-datetime.fromisoformat(p['timestamp'])).total_seconds()==0.1
        if p['latitude_deg'] and q['latitude_deg']:
            dy=math.radians(float(q['latitude_deg'])-float(p['latitude_deg']))*R
            dx=math.radians(float(q['longitude_deg'])-float(p['longitude_deg']))*R*math.cos(math.radians(LAT))
            assert abs(math.hypot(dx,dy)*36-float(q['ground_speed_kmh']))<0.12
        assert 0<=float(q['engine_load_pct'])<=100 and 0<=float(q['heading_deg'])<360
    manifest['files'].append({'file':path.name,'samples':len(rows),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
save('eventos-esperados.json',events)
save('manifest.json',manifest)
assert not [e for e in events if e['case'].startswith('01')]
assert {'near_water','outside_fence'} <= {e['event'] for e in events if e['case'].startswith('02')}
assert {'coolant_warning','gnss_unavailable'} <= {e['event'] for e in events if e['case'].startswith('03')}
save('validacao.json',{'status':'passed','samples':18003,'cases':3,'fields':len(schema),'checks':['CSV read-back','unique timestamps','100 ms cadence','GPS gap exactly 30 samples','position versus speed <0.12 km/h residual','expected events by scenario','heading and load ranges'],'limitations':'Fixture plausível e simplificada; não é modelo físico calibrado, registro real ou homologação.'})
with ZipFile(OUT.parent/'laboratorio-virtual-v1.zip','w',ZIP_DEFLATED) as z:
    for path in sorted(OUT.iterdir()):
        if path.is_file():z.write(path,arcname=OUT.name+'/'+path.name)
print(json.dumps({'directory':str(OUT),'samples':18003,'events':len(events),'validation':'passed'},ensure_ascii=False))
