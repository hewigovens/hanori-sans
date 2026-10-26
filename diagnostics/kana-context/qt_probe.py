import json,os,sys
from pathlib import Path
root=Path(__file__).resolve().parent
project=root.parents[1]
sys.path.insert(0,str(project/'vendor/qt-probe'))
os.environ['QT_QPA_PLATFORM']='offscreen'
os.environ['LANG']='en_US.UTF-8'
from PySide6.QtCore import qVersion,QLocale
from PySide6.QtGui import QGuiApplication,QFontDatabase,QFont,QTextLayout
QLocale.setDefault(QLocale('en_US'))
app=QGuiApplication([])
identifier=QFontDatabase.addApplicationFont(str(root/'work/Probe.otf'))
assert identifier>=0, 'Qt could not load the probe font'
assert 'Hanori Kana Probe' in QFontDatabase.applicationFontFamilies(identifier)
font=QFont('Hanori Kana Probe',40)
ids=json.loads((root/'work/glyphs.json').read_text())
results=[]
for text in ['日','日月','日は','は日','日ハ','ハ日','日ｱ','ｱ日','今日は日本語の勉強をします。']:
 layout=QTextLayout(text,font)
 layout.beginLayout(); line=layout.createLine(); line.setLineWidth(10000); layout.endLayout()
 glyphs=[]; families=set()
 for run in layout.glyphRuns():
  families.add(run.rawFont().familyName())
  glyphs.extend(run.glyphIndexes())
 assert families=={'Hanori Kana Probe'}, families
 assert 0 not in glyphs, 'Missing glyph'
 results.append({'text':text,'kanaOrControlRuleTriggered':ids['一'] in glyphs,'glyphs':glyphs})
assert results[0]['kanaOrControlRuleTriggered'] is False
assert results[1]['kanaOrControlRuleTriggered'] is True, 'Same-script positive control did not trigger'
import ctypes
dyld=ctypes.CDLL(None)
dyld._dyld_image_count.restype=ctypes.c_uint32
dyld._dyld_get_image_name.argtypes=[ctypes.c_uint32]
dyld._dyld_get_image_name.restype=ctypes.c_char_p
images=[dyld._dyld_get_image_name(i).decode() for i in range(dyld._dyld_image_count())]
qt_images=[p for p in images if p.endswith('/QtCore') or p.endswith('/QtGui')]
output={'loaded_qt_images':qt_images,'qt_version':qVersion(),'platform':app.platformName(),'families':list(QFontDatabase.applicationFontFamilies(identifier)),'results':results}
(root/os.environ.get('HANORI_QT_REPORT','pyside-qt-results.json')).write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(output,ensure_ascii=False,indent=2))
