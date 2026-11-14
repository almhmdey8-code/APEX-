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

const GOLD = '#E8C778';
const BLUE = '#176BCB';
const WHITE = '#F8F5ED';

const services = [
  { icon: '◉', title: 'المساعد\nالذكي', color: '#D8B45E' },
  { icon: '♧', title: 'الشحن\nوالتتبع', color: '#73B9FF' },
  { icon: '⬡', title: 'حسابي', color: '#E8C778' },
  { icon: '🛒', title: 'السلة', color: '#E8C778' },
];

const categories = [
  { icon: '📱', title: 'الإلكترونيات' },
  { icon: '🎧', title: 'الإكسسوارات' },
  { icon: '⌚', title: 'الساعات' },
  { icon: '👜', title: 'الحقائب' },
];

const tabs = [
  { icon: '•••', label: 'المزيد' },
  { icon: '▤', label: 'الطلبات' },
  { icon: '⌂', label: 'الرئيسية' },
  { icon: '▦', label: 'الأقسام' },
  { icon: '🛒', label: 'السلة' },
];

export default function HomeScreen() {
  const [activeTab, setActiveTab] = useState('الرئيسية');

  const openService = (name: string) => {
    if (name === 'الرئيسية') return;
    Alert.alert(name, 'سيتم ربط هذه الخدمة بوظائف APEX الحالية ضمن مراحل التطوير، دون تغيير بيانات المتجر.');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="light-content" backgroundColor="#05070D" />
      <View style={styles.topBar}>
        <Pressable style={styles.topIcon} onPress={() => openService('القائمة')}><Text style={styles.topIconText}>☰</Text></Pressable>
        <View style={styles.brandBlock}>
          <Text style={styles.crown}>♛</Text>
          <Text style={styles.brand}>APEX</Text>
          <Text style={styles.tagline}>SHOP SMART · LIVE LUXURY</Text>
        </View>
        <View style={styles.topActions}>
          <Pressable style={styles.topIcon} onPress={() => openService('البحث')}><Text style={styles.topIconText}>⌕</Text></Pressable>
          <Pressable style={styles.topIcon} onPress={() => openService('السلة')}><Text style={styles.topIconText}>🛒</Text><View style={styles.badge}><Text style={styles.badgeText}>0</Text></View></Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroBlueOrb} />
          <View style={styles.heroGoldLine} />
          <View style={styles.heroCopy}>
            <Text style={styles.heroKicker}>APEX ROYAL COLLECTION</Text>
            <Text style={styles.heroTitle}>متجر النخبة</Text>
            <Text style={styles.heroSubtitle}>تسوّق بذكاء .. عش الفخامة</Text>
            <Pressable style={styles.shopButton} onPress={() => openService('تسوّق الآن')}>
              <Text style={styles.shopButtonText}>تسوّق الآن  ›</Text>
            </Pressable>
          </View>
          <Text style={styles.heroCrown}>♛</Text>
          <Text style={styles.heroSpark}>✦</Text>
        </View>

        <View style={styles.servicesRow}>
          {services.map((item) => (
            <Pressable key={item.title} style={styles.serviceCard} onPress={() => openService(item.title.replace('\n', ' '))}>
              <Text style={[styles.serviceIcon, { color: item.color }]}>{item.icon}</Text>
              <Text style={styles.serviceLabel}>{item.title}</Text>
              <View style={styles.cardShine} />
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
          {categories.map((item) => (
            <Pressable key={item.title} style={styles.categoryCard} onPress={() => openService(item.title)}>
              <View style={styles.categoryArt}><Text style={styles.categoryEmoji}>{item.icon}</Text></View>
              <Text style={styles.categoryTitle}>{item.title}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.offerBanner} onPress={() => openService('العروض الحصرية')}>
          <View style={styles.offerOrb} />
          <View style={styles.offerTag}><Text style={styles.offerPercent}>٪</Text></View>
          <View style={styles.offerCopy}>
            <Text style={styles.offerTitle}>عروض حصرية</Text>
            <Text style={styles.offerSubtitle}>بأفضل الأسعار</Text>
            <View style={styles.offerButton}><Text style={styles.offerButtonText}>اكتشف العروض</Text></View>
          </View>
        </Pressable>

        <View style={styles.sectionHeading}>
          <View style={styles.headingLine} />
          <Text style={styles.sectionTitle}>اكتشف APEX</Text>
          <Text style={styles.headingDiamond}>◆</Text>
          <View style={styles.headingLine} />
        </View>
        <View style={styles.featureList}>
          {[
            ['♧', 'تتبع الشحنات', 'تابع حالة طلبك خطوة بخطوة'],
            ['◈', 'طرق دفع متعددة', 'خيارات دفع مخصصة للسعودية واليمن'],
            ['✧', 'مساعد APEX الذكي', 'مساعدة في المنتجات والطلبات'],
          ].map(([icon, title, desc]) => (
            <Pressable key={title} style={styles.featureCard} onPress={() => openService(title)}>
              <Text style={styles.featureIcon}>{icon}</Text>
              <View style={styles.featureText}><Text style={styles.featureTitle}>{title}</Text><Text style={styles.featureDesc}>{desc}</Text></View>
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
            <Pressable key={tab.label} style={[styles.tab, active && styles.activeTab]} onPress={() => { setActiveTab(tab.label); openService(tab.label); }}>
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
  safe: { flex: 1, backgroundColor: '#05070D' },
  topBar: { minHeight: 108, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#080D18', borderBottomWidth: 1, borderBottomColor: 'rgba(232,199,120,0.42)' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  topIconText: { color: WHITE, fontSize: 25, fontWeight: '600' },
  brandBlock: { alignItems: 'center', justifyContent: 'center' },
  crown: { color: GOLD, fontSize: 29, lineHeight: 31 },
  brand: { color: GOLD, fontSize: 31, fontWeight: '900', letterSpacing: 5, textShadowColor: 'rgba(232,199,120,0.55)', textShadowRadius: 12 },
  tagline: { color: '#C9B987', fontSize: 8, letterSpacing: 1.7, marginTop: 2 },
  badge: { position: 'absolute', right: -3, top: -4, width: 17, height: 17, borderRadius: 9, backgroundColor: '#D92D42', alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#FFF', fontSize: 10, fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 },
  hero: { minHeight: 214, borderRadius: 26, overflow: 'hidden', backgroundColor: '#0B1325', borderWidth: 1.5, borderColor: GOLD, justifyContent: 'center', paddingHorizontal: 20, marginBottom: 17 },
  heroBlueOrb: { position: 'absolute', width: 230, height: 230, borderRadius: 120, backgroundColor: '#073E8A', right: -65, bottom: -120, opacity: 0.8 },
  heroGoldLine: { position: 'absolute', height: 3, left: -20, right: -20, top: 12, backgroundColor: GOLD, transform: [{ rotate: '-9deg' }], opacity: 0.8 },
  heroCopy: { alignItems: 'flex-end', zIndex: 2 },
  heroKicker: { color: '#D8C58F', fontSize: 9, letterSpacing: 1.6, marginBottom: 8 },
  heroTitle: { color: '#F7D98F', fontSize: 31, fontWeight: '900', textShadowColor: 'rgba(255,205,93,0.45)', textShadowRadius: 12 },
  heroSubtitle: { color: WHITE, fontSize: 16, fontWeight: '700', marginTop: 5 },
  shopButton: { backgroundColor: GOLD, borderRadius: 24, paddingVertical: 10, paddingHorizontal: 22, marginTop: 17, borderWidth: 1, borderColor: '#FFF0C6' },
  shopButtonText: { color: '#17120A', fontWeight: '900', fontSize: 13 },
  heroCrown: { position: 'absolute', left: 13, bottom: 15, color: GOLD, fontSize: 93, opacity: 0.9 },
  heroSpark: { position: 'absolute', left: 42, top: 27, color: '#69B9FF', fontSize: 24 },
  servicesRow: { flexDirection: 'row', gap: 9, marginBottom: 22 },
  serviceCard: { flex: 1, minHeight: 112, borderRadius: 20, backgroundColor: '#0D1728', borderWidth: 1, borderColor: 'rgba(232,199,120,0.55)', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, overflow: 'hidden' },
  serviceIcon: { fontSize: 30, marginBottom: 8 },
  serviceLabel: { color: WHITE, fontSize: 12, fontWeight: '800', textAlign: 'center', lineHeight: 18 },
  cardShine: { position: 'absolute', bottom: -26, left: 0, right: 0, height: 32, backgroundColor: 'rgba(23,107,203,0.28)', borderRadius: 50 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 14 },
  headingLine: { flex: 1, height: 1, backgroundColor: 'rgba(232,199,120,0.55)' },
  sectionTitle: { color: WHITE, fontSize: 19, fontWeight: '900' },
  headingDiamond: { color: GOLD, fontSize: 12 },
  categoriesGrid: { flexDirection: 'row', gap: 9, marginBottom: 18 },
  categoryCard: { flex: 1, borderRadius: 17, overflow: 'hidden', backgroundColor: '#F1F2F5', borderWidth: 1.5, borderColor: GOLD, minHeight: 132, alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, paddingBottom: 11 },
  categoryArt: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  categoryEmoji: { fontSize: 38 },
  categoryTitle: { color: '#17191E', fontSize: 11, fontWeight: '900', textAlign: 'center' },
  offerBanner: { minHeight: 142, borderRadius: 22, backgroundColor: '#0A1427', borderWidth: 1.5, borderColor: GOLD, overflow: 'hidden', marginBottom: 22, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 },
  offerOrb: { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: '#06458E', left: -58, bottom: -100 },
  offerTag: { width: 83, height: 83, borderRadius: 16, backgroundColor: GOLD, transform: [{ rotate: '-12deg' }], alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF0C6' },
  offerPercent: { color: '#111', fontSize: 44, fontWeight: '900' },
  offerCopy: { flex: 1, alignItems: 'flex-end', paddingRight: 5 },
  offerTitle: { color: GOLD, fontSize: 25, fontWeight: '900' },
  offerSubtitle: { color: WHITE, fontSize: 14, fontWeight: '700', marginTop: 2 },
  offerButton: { backgroundColor: GOLD, borderRadius: 20, paddingHorizontal: 17, paddingVertical: 7, marginTop: 10 },
  offerButtonText: { color: '#17120A', fontWeight: '900', fontSize: 11 },
  featureList: { gap: 9 },
  featureCard: { minHeight: 69, borderRadius: 17, borderWidth: 1, borderColor: 'rgba(232,199,120,0.35)', backgroundColor: 'rgba(255,255,255,0.055)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 13 },
  featureIcon: { color: GOLD, fontSize: 25, width: 30, textAlign: 'center' },
  featureText: { flex: 1, alignItems: 'flex-end' },
  featureTitle: { color: WHITE, fontSize: 14, fontWeight: '800' },
  featureDesc: { color: '#AEB9CB', fontSize: 10, marginTop: 4 },
  featureArrow: { color: GOLD, fontSize: 28 },
  footer: { color: '#77705F', textAlign: 'center', fontSize: 9, letterSpacing: 1.6, marginTop: 24 },
  bottomNav: { minHeight: 73, backgroundColor: '#080D18', borderTopWidth: 1, borderTopColor: 'rgba(232,199,120,0.55)', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 5, paddingBottom: 5 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 60, gap: 3 },
  activeTab: { borderWidth: 1.5, borderColor: GOLD, borderRadius: 22, backgroundColor: 'rgba(232,199,120,0.12)', marginHorizontal: 2 },
  tabIcon: { color: '#D4D9E3', fontSize: 22, fontWeight: '700' },
  activeTabIcon: { color: GOLD, fontSize: 25 },
  tabLabel: { color: '#C8CED8', fontSize: 10, fontWeight: '700' },
  activeTabLabel: { color: GOLD, fontWeight: '900' },
});
