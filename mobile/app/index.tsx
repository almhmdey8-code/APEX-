import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '../src/theme';

const C = theme.colors;

const services = [
  { icon: '✧', title: 'المساعد\nالذكي', tone: 'gold' },
  { icon: '♧', title: 'الشحن\nوالتتبع', tone: 'blue' },
  { icon: '♙', title: 'حسابي', tone: 'silver' },
  { icon: '▣', title: 'السلة', tone: 'gold' },
] as const;

const categories = [
  { icon: '⌁', title: 'الإلكترونيات', hint: 'تقنية وأجهزة' },
  { icon: '◉', title: 'الإكسسوارات', hint: 'أناقة يومية' },
  { icon: '◷', title: 'الساعات', hint: 'وقت بفخامة' },
  { icon: '◇', title: 'الحقائب', hint: 'اختيارات راقية' },
];

const tabs = [
  { icon: '•••', label: 'المزيد' },
  { icon: '▤', label: 'الطلبات' },
  { icon: '⌂', label: 'الرئيسية' },
  { icon: '▦', label: 'الأقسام' },
  { icon: '▣', label: 'السلة' },
];

const features = [
  { icon: '♧', title: 'تتبع الشحنات', desc: 'تابع حالة طلبك خطوة بخطوة', tone: 'blue' },
  { icon: '◈', title: 'طرق دفع متعددة', desc: 'خيارات مخصصة للسعودية واليمن', tone: 'gold' },
  { icon: '✧', title: 'مساعد APEX الذكي', desc: 'مساعدة في المنتجات والطلبات', tone: 'silver' },
];

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState('الرئيسية');

  const openService = (name: string) => {
    if (name === 'الرئيسية') return;
    Alert.alert(name, 'سيتم ربط هذه الخدمة بوظائف APEX الحالية ضمن مراحل التطوير، دون تغيير بيانات المتجر.');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor={C.background} />
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="القائمة" style={styles.topIcon} onPress={() => openService('القائمة')}>
          <Text style={styles.topIconText}>☰</Text>
        </Pressable>

        <View style={styles.brandBlock}>
          <Text style={styles.crown}>♛</Text>
          <Text style={styles.brand}>APEX</Text>
          <Text style={styles.tagline}>ROYAL SHOPPING EXPERIENCE</Text>
        </View>

        <View style={styles.topActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="البحث" style={styles.topIcon} onPress={() => openService('البحث')}>
            <Text style={styles.searchIcon}>⌕</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="السلة" style={styles.topIcon} onPress={() => openService('السلة')}>
            <Text style={styles.topIconText}>▣</Text>
            <View style={styles.badge}><Text style={styles.badgeText}>0</Text></View>
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroBlueOrb} />
          <View style={styles.heroBlueOrbSmall} />
          <View style={styles.heroGoldHalo} />
          <View style={styles.heroTopLine} />
          <View style={styles.heroCopy}>
            <Text style={styles.heroKicker}>APEX  /  ROYAL COLLECTION</Text>
            <Text style={styles.heroTitle}>متجر النخبة</Text>
            <Text style={styles.heroSubtitle}>تسوّق بذكاء .. عش الفخامة</Text>
            <Pressable style={styles.shopButton} onPress={() => openService('تسوّق الآن')}>
              <Text style={styles.shopButtonText}>تسوّق الآن</Text>
              <Text style={styles.shopButtonArrow}>‹</Text>
            </Pressable>
          </View>
          <View style={styles.heroEmblem}>
            <Text style={styles.heroCrown}>♛</Text>
            <View style={styles.emblemUnderline} />
            <Text style={styles.emblemText}>EST. APEX</Text>
          </View>
          <Text style={styles.heroSpark}>✦</Text>
          <Text style={styles.heroSparkTwo}>✧</Text>
        </View>

        <View style={styles.servicesRow}>
          {services.map((item) => (
            <Pressable
              key={item.title}
              accessibilityRole="button"
              style={({ pressed }) => [styles.serviceCard, pressed && styles.pressed]}
              onPress={() => openService(item.title.replace('\n', ' '))}
            >
              <View style={styles.serviceIconHalo}>
                <Text style={[styles.serviceIcon, item.tone === 'blue' ? styles.blueText : item.tone === 'silver' ? styles.silverText : styles.goldText]}>{item.icon}</Text>
              </View>
              <Text style={styles.serviceLabel}>{item.title}</Text>
              <View style={styles.cardShine} />
              <View style={styles.cardTopEdge} />
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeading}>
          <View style={styles.headingLine} />
          <Text style={styles.sectionTitle}>الأقسام الرئيسية</Text>
          <Text style={styles.headingDiamond}>◆</Text>
          <View style={styles.headingLine} />
        </View>

        <View style={styles.categoriesGrid}>
          {categories.map((item, index) => (
            <Pressable
              key={item.title}
              style={({ pressed }) => [styles.categoryCard, pressed && styles.pressed]}
              onPress={() => openService(item.title)}
            >
              <View style={[styles.categoryGlow, index % 2 === 0 ? styles.categoryGlowGold : styles.categoryGlowBlue]} />
              <View style={styles.categoryArt}>
                <Text style={[styles.categoryEmoji, index % 2 === 0 ? styles.goldText : styles.blueText]}>{item.icon}</Text>
              </View>
              <Text style={styles.categoryTitle}>{item.title}</Text>
              <Text style={styles.categoryHint}>{item.hint}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={({ pressed }) => [styles.offerBanner, pressed && styles.pressed]} onPress={() => openService('العروض الحصرية')}>
          <View style={styles.offerOrb} />
          <View style={styles.offerOrbSmall} />
          <View style={styles.offerSeal}>
            <Text style={styles.offerPercent}>٪</Text>
            <Text style={styles.offerSealCaption}>SPECIAL</Text>
          </View>
          <View style={styles.offerCopy}>
            <Text style={styles.offerKicker}>اختيارات تستحقها</Text>
            <Text style={styles.offerTitle}>عروض حصرية</Text>
            <Text style={styles.offerSubtitle}>بأفضل الأسعار</Text>
            <View style={styles.offerButton}>
              <Text style={styles.offerButtonText}>اكتشف العروض  ‹</Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.sectionHeading}>
          <View style={styles.headingLine} />
          <Text style={styles.sectionTitle}>اكتشف APEX</Text>
          <Text style={styles.headingDiamond}>◆</Text>
          <View style={styles.headingLine} />
        </View>

        <View style={styles.featureList}>
          {features.map((item) => (
            <Pressable
              key={item.title}
              style={({ pressed }) => [styles.featureCard, pressed && styles.pressed]}
              onPress={() => openService(item.title)}
            >
              <View style={[styles.featureIconBox, item.tone === 'blue' ? styles.featureBlue : item.tone === 'silver' ? styles.featureSilver : styles.featureGold]}>
                <Text style={[styles.featureIcon, item.tone === 'blue' ? styles.blueText : item.tone === 'silver' ? styles.silverText : styles.goldText]}>{item.icon}</Text>
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{item.title}</Text>
                <Text style={styles.featureDesc}>{item.desc}</Text>
              </View>
              <Text style={styles.featureArrow}>‹</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.footer}>APEX  •  SHOP SMART · LIVE LUXURY</Text>
      </ScrollView>

      <View style={styles.bottomNav}>
        {tabs.map((tab) => {
          const active = activeTab === tab.label;
          return (
            <Pressable
              key={tab.label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.tab, active && styles.activeTab]}
              onPress={() => { setActiveTab(tab.label); openService(tab.label); }}
            >
              <Text style={[styles.tabIcon, active && styles.activeTabIcon]}>{tab.icon}</Text>
              <Text style={[styles.tabLabel, active && styles.activeTabLabel]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  topBar: {
    minHeight: 100, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', backgroundColor: '#080C15',
    borderBottomWidth: 1, borderBottomColor: 'rgba(214,180,106,0.34)',
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topIcon: {
    width: 40, height: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.055)',
    borderWidth: 1, borderColor: 'rgba(226,232,242,0.14)', alignItems: 'center', justifyContent: 'center',
  },
  topIconText: { color: C.white, fontSize: 21, fontWeight: '600' },
  searchIcon: { color: C.white, fontSize: 28, lineHeight: 31 },
  brandBlock: { alignItems: 'center', justifyContent: 'center' },
  crown: { color: C.goldLight, fontSize: 26, lineHeight: 28, textShadowColor: 'rgba(232,199,120,0.6)', textShadowRadius: 9 },
  brand: { color: C.goldLight, fontSize: 30, fontWeight: '900', letterSpacing: 5, textShadowColor: 'rgba(232,199,120,0.5)', textShadowRadius: 13 },
  tagline: { color: '#B9C2D1', fontSize: 7, letterSpacing: 1.55, marginTop: 3 },
  badge: { position: 'absolute', right: -3, top: -4, width: 17, height: 17, borderRadius: 9, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#090B11' },
  badgeText: { color: '#111318', fontSize: 9, fontWeight: '900' },
  content: { paddingHorizontal: 15, paddingTop: 15, paddingBottom: 26 },
  hero: {
    minHeight: 218, borderRadius: 25, overflow: 'hidden', backgroundColor: '#0A1222',
    borderWidth: 1.2, borderColor: 'rgba(232,199,120,0.82)', justifyContent: 'center',
    paddingHorizontal: 19, marginBottom: 16,
  },
  heroBlueOrb: { position: 'absolute', width: 245, height: 245, borderRadius: 130, backgroundColor: '#0A4D9B', right: -105, bottom: -145, opacity: 0.72 },
  heroBlueOrbSmall: { position: 'absolute', width: 140, height: 140, borderRadius: 75, backgroundColor: '#1C73C9', right: -58, top: -80, opacity: 0.22 },
  heroGoldHalo: { position: 'absolute', width: 170, height: 170, borderRadius: 90, borderWidth: 1, borderColor: 'rgba(232,199,120,0.2)', left: -76, top: 30 },
  heroTopLine: { position: 'absolute', height: 1, left: 18, right: 18, top: 13, backgroundColor: 'rgba(232,199,120,0.55)' },
  heroCopy: { alignItems: 'flex-end', zIndex: 2, paddingRight: 2 },
  heroKicker: { color: '#D7C99F', fontSize: 8, letterSpacing: 1.45, marginBottom: 8 },
  heroTitle: { color: '#F2D58F', fontSize: 30, fontWeight: '900', textShadowColor: 'rgba(255,205,93,0.38)', textShadowRadius: 12 },
  heroSubtitle: { color: '#F3F5F9', fontSize: 14, fontWeight: '700', marginTop: 5 },
  shopButton: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: C.goldLight, borderRadius: 22, paddingVertical: 9, paddingHorizontal: 18, marginTop: 15, borderWidth: 1, borderColor: '#FFF0C6' },
  shopButtonText: { color: '#17130A', fontWeight: '900', fontSize: 12 },
  shopButtonArrow: { color: '#17130A', fontSize: 20, lineHeight: 20, marginTop: -2 },
  heroEmblem: { position: 'absolute', left: 16, bottom: 13, alignItems: 'center', opacity: 0.88 },
  heroCrown: { color: C.goldLight, fontSize: 74, lineHeight: 82, textShadowColor: 'rgba(232,199,120,0.55)', textShadowRadius: 13 },
  emblemUnderline: { width: 50, height: 1, backgroundColor: C.gold, marginTop: -5 },
  emblemText: { color: '#B7C4D7', fontSize: 6, letterSpacing: 2, marginTop: 4 },
  heroSpark: { position: 'absolute', left: 88, top: 32, color: '#82C5FF', fontSize: 22 },
  heroSparkTwo: { position: 'absolute', left: 34, top: 28, color: '#E7D19A', fontSize: 13 },
  servicesRow: { flexDirection: 'row', gap: 8, marginBottom: 21 },
  serviceCard: {
    flex: 1, minHeight: 106, borderRadius: 18, backgroundColor: 'rgba(15,27,46,0.88)',
    borderWidth: 1, borderColor: 'rgba(214,180,106,0.48)', alignItems: 'center',
    justifyContent: 'center', paddingVertical: 9, overflow: 'hidden',
  },
  serviceIconHalo: { width: 42, height: 42, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.055)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  serviceIcon: { fontSize: 24, fontWeight: '700' },
  serviceLabel: { color: C.white, fontSize: 11, fontWeight: '800', textAlign: 'center', lineHeight: 17 },
  cardShine: { position: 'absolute', bottom: -24, left: 0, right: 0, height: 34, backgroundColor: 'rgba(23,107,203,0.19)', borderRadius: 50 },
  cardTopEdge: { position: 'absolute', top: 0, left: 15, right: 15, height: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 13 },
  headingLine: { flex: 1, height: 1, backgroundColor: 'rgba(214,180,106,0.45)' },
  sectionTitle: { color: C.white, fontSize: 17, fontWeight: '900' },
  headingDiamond: { color: C.gold, fontSize: 10 },
  categoriesGrid: { flexDirection: 'row', gap: 8, marginBottom: 17 },
  categoryCard: {
    flex: 1, minHeight: 130, borderRadius: 16, overflow: 'hidden',
    backgroundColor: 'rgba(226,232,242,0.94)', borderWidth: 1, borderColor: 'rgba(242,214,151,0.92)',
    alignItems: 'center', justifyContent: 'space-between', paddingTop: 11, paddingBottom: 10,
  },
  categoryGlow: { position: 'absolute', width: 95, height: 95, borderRadius: 50, top: 4, opacity: 0.22 },
  categoryGlowGold: { backgroundColor: '#E3B958' },
  categoryGlowBlue: { backgroundColor: '#4C9CE7' },
  categoryArt: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  categoryEmoji: { fontSize: 34, fontWeight: '700' },
  categoryTitle: { color: '#171C26', fontSize: 10, fontWeight: '900', textAlign: 'center' },
  categoryHint: { color: '#586274', fontSize: 8, marginTop: 3 },
  offerBanner: {
    minHeight: 142, borderRadius: 21, backgroundColor: '#0B1528',
    borderWidth: 1.2, borderColor: 'rgba(232,199,120,0.76)', overflow: 'hidden',
    marginBottom: 21, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
  },
  offerOrb: { position: 'absolute', width: 190, height: 190, borderRadius: 100, backgroundColor: '#07509B', left: -76, bottom: -112, opacity: 0.72 },
  offerOrbSmall: { position: 'absolute', width: 100, height: 100, borderRadius: 55, backgroundColor: '#63B5F8', left: -30, top: -55, opacity: 0.16 },
  offerSeal: { width: 76, height: 76, borderRadius: 19, backgroundColor: C.goldLight, transform: [{ rotate: '-9deg' }], alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFF3D0' },
  offerPercent: { color: '#17130A', fontSize: 37, lineHeight: 41, fontWeight: '900' },
  offerSealCaption: { color: '#62502A', fontSize: 6, letterSpacing: 1.4, fontWeight: '900' },
  offerCopy: { flex: 1, alignItems: 'flex-end', paddingRight: 5 },
  offerKicker: { color: '#9CCBFA', fontSize: 8, marginBottom: 3 },
  offerTitle: { color: C.goldLight, fontSize: 23, fontWeight: '900' },
  offerSubtitle: { color: C.white, fontSize: 12, fontWeight: '700', marginTop: 2 },
  offerButton: { backgroundColor: C.goldLight, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 7, marginTop: 9 },
  offerButtonText: { color: '#17130A', fontWeight: '900', fontSize: 10 },
  featureList: { gap: 8 },
  featureCard: {
    minHeight: 68, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(214,180,106,0.28)',
    backgroundColor: 'rgba(255,255,255,0.055)', flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, gap: 11,
  },
  featureIconBox: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  featureGold: { backgroundColor: 'rgba(214,180,106,0.11)', borderColor: 'rgba(214,180,106,0.28)' },
  featureBlue: { backgroundColor: 'rgba(40,126,207,0.14)', borderColor: 'rgba(93,170,238,0.3)' },
  featureSilver: { backgroundColor: 'rgba(226,232,242,0.1)', borderColor: 'rgba(226,232,242,0.22)' },
  featureIcon: { fontSize: 21, fontWeight: '700' },
  featureText: { flex: 1, alignItems: 'flex-end' },
  featureTitle: { color: C.white, fontSize: 13, fontWeight: '800' },
  featureDesc: { color: '#AEB9CB', fontSize: 9, marginTop: 4 },
  featureArrow: { color: C.goldLight, fontSize: 26 },
  footer: { color: '#7D8798', textAlign: 'center', fontSize: 8, letterSpacing: 1.45, marginTop: 22 },
  bottomNav: {
    minHeight: 70, backgroundColor: '#080C15', borderTopWidth: 1,
    borderTopColor: 'rgba(214,180,106,0.42)', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 5, paddingBottom: 4,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 58, gap: 3 },
  activeTab: { borderWidth: 1, borderColor: 'rgba(232,199,120,0.7)', borderRadius: 19, backgroundColor: 'rgba(214,180,106,0.1)', marginHorizontal: 2 },
  tabIcon: { color: '#C7D0DF', fontSize: 19, fontWeight: '700' },
  activeTabIcon: { color: C.goldLight, fontSize: 22 },
  tabLabel: { color: '#C7D0DF', fontSize: 9, fontWeight: '700' },
  activeTabLabel: { color: C.goldLight, fontWeight: '900' },
  goldText: { color: C.goldLight },
  blueText: { color: '#8BC8FF' },
  silverText: { color: '#E5EAF2' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
});
