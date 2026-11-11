Attribute VB_Name = "PlanMaintenance"
Option Explicit
'==========================================================================
'  GENERATEUR DE PLAN DE MAINTENANCE PREVENTIVE  -  Sujet 2
'
'  Séance 5 : moteur de génération des dates (périodicité temporelle)
'  Séance 6 : périodicité d'usage (compteur), conflits de charge,
'             cas limites et signalement visuel
'
'  Macro principale  : GenererPlanMaintenance   (Alt + F8)
'  Macro de test     : TesterMoteur             (remplit la feuille Tests)
'
'  Feuilles lues     : Equipement (saisie), Gamme, paramétre
'  Feuilles écrites  : Calcul_Maintenance, Planning, Durée, Conflits,
'                      Gantt, Tests
'==========================================================================

'---------- Structures de données ----------
Private Type TEquipement
    ID As String
    Nom As String
    TypeP As String          ' "Temporelle" ou "Usage"
    Periode As Double        ' 3 (mois) ou 500 (h)
    Unite As String          ' Mois / Semaine / Jour / An / h
    DerniereDate As Variant  ' date de la dernière intervention
    CptActuel As Double      ' compteur d'heures actuel
    CptDernier As Double     ' compteur relevé à la dernière intervention
    Criticite As String
    Duree As Double          ' durée prévue de l'intervention (h)
    Technicien As String
    UsageJour As Double      ' heures de fonctionnement par jour
    UsageEstime As Boolean   ' True si UsageJour est calculé (non saisi)
    ' --- résultats ---
    Valide As Boolean
    Erreur As String
    DateTheo As Variant      ' prochaine date (théorique ou estimée)
    Cible As Double          ' compteur cible (Usage)
    Restant As Double        ' heures restantes avant la cible (Usage)
    Retard As String         ' "12 j" ou "600 h"
    Etat As String
End Type

Private Type TIntervention
    IdxEq As Long            ' indice dans gEq()
    Numero As Long           ' n° d'échéance (1 = prochaine)
    DatePrevue As Date
    Declenchement As String
    Etat As String
    Alerte As String
End Type

Private Type TAlerte
    Quand As Variant
    Equipements As String
    Technicien As String
    TypeControle As String
    Resultat As String
    Detail As String
End Type

'---------- Variables globales du module ----------
Private gEq() As TEquipement, gNbEq As Long
Private gInt() As TIntervention, gNbInt As Long
Private gAl() As TAlerte, gNbAl As Long
Private gTech() As String, gNbTech As Long

Private gDateRef As Date        ' "aujourd'hui" (ou date de test)
Private gFinHorizon As Date
Private gCapacite As Double     ' h max / technicien / semaine
Private gAlerteH As Double      ' alerte compteur proche (h)
Private gHorizon As Long        ' mois
Private gNbDates As Long        ' nb d'échéances affichées
Private gSeuilRetard As Long    ' jours de tolérance
Private gNbMax As Long          ' nb max d'interventions / semaine

' semaines (calculées dans DetecterConflits)
Private gLundi1 As Date, gNbSem As Long
Private gSemNb() As Long, gSemCharge() As Double, gSemConflit() As String

Private gSilencieux As Boolean  ' True = pas de MsgBox (tests)

'==========================================================================
'  MACRO PRINCIPALE
'==========================================================================
Public Sub GenererPlanMaintenance()
    On Error GoTo Erreur
    Application.ScreenUpdating = False

    LireParametres          ' feuille paramétre
    LireEquipements         ' feuille Equipement  (Séance 5 - consigne 1)
    CalculerEquipements     ' prochaine date / compteur cible / état
    GenererInterventions    ' toutes les échéances sur l'horizon
    DetecterConflits        ' charge, nb d'interventions, même date (Séance 6)

    EcrireCalcul
    EcrirePlanning
    EcrireCharge
    EcrireConflits
    EcrireGantt
    CreerBouton

    Application.ScreenUpdating = True
    If Not gSilencieux Then
        MsgBox "Plan de maintenance généré au " & Format(gDateRef, "dd/mm/yyyy") & vbCrLf & vbCrLf & _
               gNbEq & " équipements" & vbCrLf & _
               gNbInt & " interventions sur " & gHorizon & " mois" & vbCrLf & _
               CompterEtat("En retard") + CompterEtat("Retard critique") & " équipement(s) en retard" & vbCrLf & _
               CompterSemainesConflit() & " semaine(s) en conflit de charge" & vbCrLf & _
               CompterAlertes("Même date") & " cas de dates identiques", vbInformation, "Plan de maintenance"
    End If
    Exit Sub
Erreur:
    Application.ScreenUpdating = True
    If gSilencieux Then Err.Raise Err.Number, , Err.Description
    MsgBox "Erreur : " & Err.Description, vbCritical, "Plan de maintenance"
End Sub

'==========================================================================
'  SEANCE 5 - MOTEUR DE DATES (fonctions "pures", testables seules)
'==========================================================================

' Date de la k-ième échéance après la dernière intervention.
' On repart TOUJOURS de la date d'origine (k * période) : pas de dérive
' de fin de mois (31/01 -> 28/02 -> 31/03 et non 28/03).
Public Function ProchaineDate(ByVal dDerniere As Date, ByVal periode As Double, _
                              ByVal unite As String, Optional ByVal k As Long = 1) As Date
    Select Case CodeUnite(unite)
        Case "m": ProchaineDate = DateAdd("m", k * periode, dDerniere)
        Case "s": ProchaineDate = DateAdd("d", 7 * k * periode, dDerniere)
        Case "j": ProchaineDate = DateAdd("d", k * periode, dDerniere)
        Case "a": ProchaineDate = DateAdd("yyyy", k * periode, dDerniere)
        Case Else: Err.Raise vbObjectError + 10, , "Unité de périodicité inconnue : " & unite
    End Select
End Function

' Règle d'état pour une périodicité temporelle
Public Function EtatTemporel(ByVal dDerniere As Date, ByVal periode As Double, ByVal unite As String, _
                             ByVal dRef As Date, ByVal seuilJours As Long) As String
    Dim d1 As Date, d2 As Date
    d1 = ProchaineDate(dDerniere, periode, unite, 1)
    If dRef - d1 > seuilJours Then
        d2 = ProchaineDate(dDerniere, periode, unite, 2)
        If d2 < dRef Then
            EtatTemporel = "Retard critique"   ' au moins une période entière manquée
        Else
            EtatTemporel = "En retard"
        End If
    Else
        EtatTemporel = "Planifiée"
    End If
End Function

'==========================================================================
'  SEANCE 6 - PERIODICITE D'USAGE (compteur)
'==========================================================================

' Règle d'état pour une périodicité d'usage
Public Function EtatUsage(ByVal cptActuel As Double, ByVal cible As Double, _
                          ByVal periode As Double, ByVal alerteH As Double) As String
    If cptActuel >= cible + periode Then
        EtatUsage = "Retard critique"      ' compteur dépasse largement (> 1 période)
    ElseIf cptActuel >= cible Then
        EtatUsage = "En retard"
    ElseIf cible - cptActuel <= alerteH Then
        EtatUsage = "À surveiller"
    Else
        EtatUsage = "Planifiée"
    End If
End Function

' Date estimée à laquelle le compteur atteindra "cible"
' (heures restantes / heures par jour, arrondi au jour supérieur)
Public Function DateUsageEstimee(ByVal cptActuel As Double, ByVal cible As Double, _
                                 ByVal heuresParJour As Double, ByVal dRef As Date) As Date
    If cible <= cptActuel Then
        DateUsageEstimee = dRef                       ' déjà atteint : à faire tout de suite
    Else
        DateUsageEstimee = dRef - Int(-(cible - cptActuel) / heuresParJour)
    End If
End Function

' Usage moyen (h/jour) = heures consommées depuis la dernière intervention / jours écoulés
Public Function UsageMoyen(ByVal cptActuel As Double, ByVal cptDernier As Double, _
                           ByVal dDerniere As Variant, ByVal dRef As Date) As Double
    UsageMoyen = 0
    If IsDate(dDerniere) Then
        If dRef > CDate(dDerniere) And cptActuel > cptDernier Then
            UsageMoyen = (cptActuel - cptDernier) / (dRef - CDate(dDerniere))
        End If
    End If
End Function

'==========================================================================
'  LECTURE DES DONNEES
'==========================================================================
Private Sub LireParametres()
    Dim v As Variant
    gCapacite = Param("capacit", 8)
    gAlerteH = Param("alerte", 100)
    gHorizon = Param("horizon", 12)
    gNbDates = Param("nombre de dates", 4)
    gSeuilRetard = Param("seuil de retard", 0)
    gNbMax = Param("nb max", 3)
    v = Param("date de r", Empty)
    If IsDate(v) Then gDateRef = CDate(v) Else gDateRef = Date
    If gNbDates < 1 Then gNbDates = 4
    If gHorizon < 1 Then gHorizon = 12
    gFinHorizon = DateAdd("m", gHorizon, gDateRef)
End Sub

Private Sub LireEquipements()
    Dim ws As Worksheet, r As Long, der As Long, n As Long, v As Variant
    Set ws = Feuille("Equip")
    der = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    gNbEq = 0
    gNbTech = 0
    If der < 2 Then Err.Raise vbObjectError + 20, , "Aucun équipement saisi dans la feuille Equipement."
    ReDim gEq(1 To der - 1)

    For r = 2 To der
        If Trim(CStr(ws.Cells(r, 1).Value)) <> "" Then
            n = n + 1
            With gEq(n)
                .ID = Trim(CStr(ws.Cells(r, 1).Value))
                .Nom = Trim(CStr(ws.Cells(r, 2).Value))
                .TypeP = NormaliserType(ws.Cells(r, 4).Value)
                .Periode = Nombre(ws.Cells(r, 5).Value)
                .Unite = Trim(CStr(ws.Cells(r, 6).Value))
                v = ws.Cells(r, 7).Value
                If IsDate(v) Then .DerniereDate = CDate(v) Else .DerniereDate = Empty
                .CptActuel = Nombre(ws.Cells(r, 8).Value)
                .CptDernier = Nombre(ws.Cells(r, 9).Value)
                .Criticite = Trim(CStr(ws.Cells(r, 10).Value))
                .Duree = Nombre(ws.Cells(r, 11).Value)
                .Technicien = Trim(CStr(ws.Cells(r, 12).Value))
                If .Technicien = "" Then .Technicien = "Non affecté"
                .UsageJour = Nombre(ws.Cells(r, 13).Value)
                .UsageEstime = False

                ' --- contrôles de saisie ---
                .Valide = True: .Erreur = ""
                If .TypeP = "" Then
                    .Erreur = "Type de périodicité inconnu (Temporelle / Usage)"
                ElseIf .Periode <= 0 Then
                    .Erreur = "Périodicité manquante ou nulle"
                ElseIf .TypeP = "Temporelle" And IsEmpty(.DerniereDate) Then
                    .Erreur = "Date de dernière intervention manquante"
                ElseIf .TypeP = "Temporelle" And CodeUnite(.Unite) = "" Then
                    .Erreur = "Unité inconnue pour une périodicité temporelle : " & .Unite
                ElseIf .TypeP = "Usage" And .CptActuel < .CptDernier Then
                    .Erreur = "Compteur actuel inférieur au dernier compteur"
                End If
                If .Erreur <> "" Then .Valide = False
            End With
            AjouterTechnicien gEq(n).Technicien
        End If
    Next r
    gNbEq = n
End Sub

'==========================================================================
'  CALCUL PAR EQUIPEMENT (prochaine échéance + état)
'==========================================================================
Private Sub CalculerEquipements()
    Dim i As Long
    For i = 1 To gNbEq
        With gEq(i)
            .DateTheo = Empty: .Cible = 0: .Restant = 0: .Retard = ""
            If Not .Valide Then
                .Etat = "À définir"

            ElseIf .TypeP = "Temporelle" Then
                .DateTheo = ProchaineDate(.DerniereDate, .Periode, .Unite, 1)
                .Etat = EtatTemporel(.DerniereDate, .Periode, .Unite, gDateRef, gSeuilRetard)
                If .Etat <> "Planifiée" Then .Retard = CLng(gDateRef - .DateTheo) & " j"

            Else ' Usage
                .Cible = .CptDernier + .Periode
                .Restant = .Cible - .CptActuel
                .Etat = EtatUsage(.CptActuel, .Cible, .Periode, gAlerteH)
                If .Restant < 0 Then .Retard = Format(-.Restant, "0") & " h"
                If .UsageJour <= 0 Then
                    .UsageJour = UsageMoyen(.CptActuel, .CptDernier, .DerniereDate, gDateRef)
                    .UsageEstime = True
                End If
                If .UsageJour > 0 Then
                    .DateTheo = DateUsageEstimee(.CptActuel, .Cible, .UsageJour, gDateRef)
                ElseIf .Restant > 0 Then
                    .Etat = "À définir"          ' pas d'usage connu : date impossible
                    .Erreur = "Usage (h/jour) inconnu : saisir colonne M ou mettre à jour le compteur"
                Else
                    .DateTheo = gDateRef
                End If
            End If
        End With
    Next i
End Sub

' Date de la k-ième échéance d'un équipement (Empty si impossible)
Private Function DateEcheance(ByVal i As Long, ByVal k As Long) As Variant
    DateEcheance = Empty
    With gEq(i)
        If .Etat = "À définir" Then Exit Function
        If .TypeP = "Temporelle" Then
            If .Etat = "Planifiée" Then
                DateEcheance = ProchaineDate(.DerniereDate, .Periode, .Unite, k)
            ElseIf k = 1 Then
                DateEcheance = gDateRef                       ' rattrapage immédiat
            Else
                DateEcheance = ProchaineDate(gDateRef, .Periode, .Unite, k - 1)
            End If
        Else
            If .UsageJour > 0 Then
                DateEcheance = DateUsageEstimee(.CptActuel, CibleEcheance(i, k), .UsageJour, gDateRef)
            ElseIf k = 1 Then
                DateEcheance = gDateRef
            End If
        End If
    End With
End Function

' Compteur cible de la k-ième échéance (Usage)
Private Function CibleEcheance(ByVal i As Long, ByVal k As Long) As Double
    With gEq(i)
        If .Restant <= 0 And k > 1 Then
            CibleEcheance = .CptActuel + (k - 1) * .Periode   ' après rattrapage
        Else
            CibleEcheance = .Cible + (k - 1) * .Periode
        End If
    End With
End Function

'==========================================================================
'  GENERATION DE TOUTES LES INTERVENTIONS SUR L'HORIZON
'==========================================================================
Private Sub GenererInterventions()
    Dim i As Long, k As Long, d As Variant
    gNbInt = 0
    ReDim gInt(1 To 1)
    For i = 1 To gNbEq
        k = 1
        Do
            d = DateEcheance(i, k)
            If IsEmpty(d) Then Exit Do
            If CDate(d) > gFinHorizon Then Exit Do
            gNbInt = gNbInt + 1
            ReDim Preserve gInt(1 To gNbInt)
            With gInt(gNbInt)
                .IdxEq = i
                .Numero = k
                .DatePrevue = CDate(d)
                .Alerte = ""
                If k = 1 Then .Etat = gEq(i).Etat Else .Etat = "Planifiée"
                If gEq(i).TypeP = "Temporelle" Then
                    If k = 1 And gEq(i).Etat <> "Planifiée" Then
                        .Declenchement = "Date (prévue le " & Format(gEq(i).DateTheo, "dd/mm/yyyy") & ")"
                    Else
                        .Declenchement = "Date (tous les " & gEq(i).Periode & " " & gEq(i).Unite & ")"
                    End If
                Else
                    .Declenchement = "Compteur " & Format(CibleEcheance(i, k), "0") & " h"
                    If .DatePrevue > gDateRef Then .Declenchement = .Declenchement & " (date estimée)"
                End If
            End With
            k = k + 1
        Loop While k <= 500
    Next i
    TrierInterventions
End Sub

' Tri par date, puis criticité décroissante (tri par insertion, stable).
' On trie une clé numérique : date * 10 + (4 - rang de criticité)
' -> à date égale, l'équipement le plus critique passe en premier.
Private Sub TrierInterventions()
    Dim i As Long, j As Long, x As Long, cx As Double
    Dim cle() As Double, idx() As Long, tmp() As TIntervention
    If gNbInt < 2 Then Exit Sub
    ReDim cle(1 To gNbInt): ReDim idx(1 To gNbInt): ReDim tmp(1 To gNbInt)
    For i = 1 To gNbInt
        idx(i) = i
        cle(i) = CDbl(gInt(i).DatePrevue) * 10 + (4 - RangCriticite(gEq(gInt(i).IdxEq).Criticite))
    Next i
    For i = 2 To gNbInt
        x = idx(i): cx = cle(i)
        j = i - 1
        Do While j >= 1
            If cle(j) <= cx Then Exit Do
            idx(j + 1) = idx(j): cle(j + 1) = cle(j)
            j = j - 1
        Loop
        idx(j + 1) = x: cle(j + 1) = cx
    Next i
    For i = 1 To gNbInt: CopierInter tmp(i), gInt(idx(i)): Next i
    For i = 1 To gNbInt: CopierInter gInt(i), tmp(i): Next i
End Sub

Private Sub CopierInter(ByRef dest As TIntervention, ByRef src As TIntervention)
    dest.IdxEq = src.IdxEq
    dest.Numero = src.Numero
    dest.DatePrevue = src.DatePrevue
    dest.Declenchement = src.Declenchement
    dest.Etat = src.Etat
    dest.Alerte = src.Alerte
End Sub

'==========================================================================
'  SEANCE 6 - DETECTION DES CONFLITS ET CAS LIMITES
'==========================================================================
Private Sub DetecterConflits()
    Dim i As Long, j As Long, s As Long, t As Long, txt As String, lst As String
    Dim a As Long, b As Long, iMoins As Long, dProp As Date

    gNbAl = 0
    ReDim gAl(1 To 1)

    ' --- 1. Alertes par équipement (retards, compteur proche, saisie) ---
    For i = 1 To gNbEq
        With gEq(i)
            Select Case .Etat
                Case "En retard", "Retard critique"
                    If .TypeP = "Temporelle" Then
                        AjouterAlerte .DateTheo, .ID & " - " & .Nom, .Technicien, "Retard (date dépassée)", .Etat, _
                            "Échéance du " & Format(.DateTheo, "dd/mm/yyyy") & " dépassée de " & .Retard & _
                            " -> intervention replanifiée le " & Format(gDateRef, "dd/mm/yyyy")
                    Else
                        AjouterAlerte "Compteur " & Format(.CptActuel, "0") & " h", .ID & " - " & .Nom, .Technicien, _
                            "Retard (compteur dépassé)", .Etat, "Cible " & Format(.Cible, "0") & " h dépassée de " & _
                            .Retard & " -> intervention immédiate"
                    End If
                Case "À surveiller"
                    AjouterAlerte "Compteur " & Format(.CptActuel, "0") & " h", .ID & " - " & .Nom, .Technicien, _
                        "Seuil d'usage proche", "À surveiller", "Reste " & Format(.Restant, "0") & " h avant " & _
                        Format(.Cible, "0") & " h (date estimée " & Format(.DateTheo, "dd/mm/yyyy") & ")"
                Case "À définir"
                    AjouterAlerte "-", .ID & " - " & .Nom, .Technicien, "Saisie incomplète", "À définir", .Erreur
            End Select
        End With
    Next i

    ' --- 2. Charge par semaine : nb d'interventions et heures par technicien ---
    gLundi1 = Lundi(gDateRef)
    gNbSem = (Lundi(gFinHorizon) - gLundi1) \ 7 + 1
    ReDim gSemNb(1 To gNbSem)
    ReDim gSemCharge(1 To gNbSem, 1 To IIf(gNbTech > 0, gNbTech, 1))
    ReDim gSemConflit(1 To gNbSem)

    For i = 1 To gNbInt
        s = NumSemaine(gInt(i).DatePrevue)
        gSemNb(s) = gSemNb(s) + 1
        t = IndexTech(gEq(gInt(i).IdxEq).Technicien)
        gSemCharge(s, t) = gSemCharge(s, t) + gEq(gInt(i).IdxEq).Duree
    Next i

    For s = 1 To gNbSem
        txt = ""
        If gSemNb(s) > gNbMax Then
            txt = "Trop d'interventions : " & gSemNb(s) & " > " & gNbMax
            AjouterAlerte LibSemaine(gLundi1 + 7 * (s - 1)), ListeEqSemaine(s, ""), "Tous", _
                "Nombre d'interventions / semaine", "CONFLIT", txt
        End If
        For t = 1 To gNbTech
            If gSemCharge(s, t) > gCapacite Then
                If txt <> "" Then txt = txt & " ; "
                txt = txt & "Surcharge " & gTech(t) & " : " & gSemCharge(s, t) & " h > " & gCapacite & " h"
                AjouterAlerte LibSemaine(gLundi1 + 7 * (s - 1)), ListeEqSemaine(s, gTech(t)), gTech(t), _
                    "Charge hebdomadaire", "CONFLIT", gSemCharge(s, t) & " h prévues pour " & gCapacite & " h disponibles"
            End If
        Next t
        gSemConflit(s) = txt
    Next s

    For i = 1 To gNbInt
        If gSemConflit(NumSemaine(gInt(i).DatePrevue)) <> "" Then AjouterTexte gInt(i).Alerte, "Conflit semaine"
    Next i

    ' --- 3. Cas limite : deux équipements à la même date ---
    For a = 1 To gNbInt - 1
        For b = a + 1 To gNbInt
            If gInt(b).DatePrevue <> gInt(a).DatePrevue Then Exit For   ' liste triée
            AjouterTexte gInt(a).Alerte, "Même date que " & gEq(gInt(b).IdxEq).ID
            AjouterTexte gInt(b).Alerte, "Même date que " & gEq(gInt(a).IdxEq).ID
            lst = gEq(gInt(a).IdxEq).ID & " + " & gEq(gInt(b).IdxEq).ID
            If gEq(gInt(a).IdxEq).Technicien = gEq(gInt(b).IdxEq).Technicien Then
                ' même technicien : on propose de décaler le moins critique
                ' (la liste est triée : à date égale, gInt(a) est le plus critique)
                iMoins = b
                If RangCriticite(gEq(gInt(b).IdxEq).Criticite) < RangCriticite(gEq(gInt(a).IdxEq).Criticite) Then
                    txt = " (moins critique)"
                Else
                    txt = " (même criticité)"
                End If
                dProp = JourOuvreSuivant(gInt(iMoins).DatePrevue)
                AjouterAlerte gInt(a).DatePrevue, lst, gEq(gInt(a).IdxEq).Technicien, "Même date - même technicien", _
                    "À arbitrer", (gEq(gInt(a).IdxEq).Duree + gEq(gInt(b).IdxEq).Duree) & " h le même jour : enchaîner " & _
                    "les deux ou décaler " & gEq(gInt(iMoins).IdxEq).ID & txt & " au " & Format(dProp, "dd/mm/yyyy")
            Else
                AjouterAlerte gInt(a).DatePrevue, lst, gEq(gInt(a).IdxEq).Technicien & " / " & _
                    gEq(gInt(b).IdxEq).Technicien, "Même date - techniciens différents", "OK", _
                    "Interventions en parallèle possibles"
            End If
        Next b
    Next a
End Sub

'==========================================================================
'  ECRITURE DES FEUILLES
'==========================================================================
Private Sub EcrireCalcul()
    Dim ws As Worksheet, i As Long, k As Long, r As Long, d As Variant, nbCol As Long
    Dim titres() As String
    Set ws = Feuille("Calcul")
    Vider ws
    nbCol = 14 + gNbDates
    ReDim titres(0 To nbCol - 1)
    titres(0) = "ID": titres(1) = "Équipement": titres(2) = "Type": titres(3) = "Périodicité"
    titres(4) = "Unité": titres(5) = "Dernière intervention": titres(6) = "Dernier compteur"
    titres(7) = "Compteur actuel": titres(8) = "Usage moyen (h/j) (italique = estimé)": titres(9) = "Compteur cible"
    titres(10) = "Heures restantes": titres(11) = "Prochaine date": titres(12) = "Retard"
    titres(13) = "État"
    For k = 1 To gNbDates: titres(13 + k) = "Échéance " & k: Next k
    Entete ws, 1, titres

    For i = 1 To gNbEq
        r = i + 1
        With gEq(i)
            ws.Cells(r, 1).Value = .ID
            ws.Cells(r, 2).Value = .Nom
            ws.Cells(r, 3).Value = .TypeP
            ws.Cells(r, 4).Value = .Periode
            ws.Cells(r, 5).Value = .Unite
            If Not IsEmpty(.DerniereDate) Then ws.Cells(r, 6).Value = .DerniereDate
            If .TypeP = "Usage" Then
                ws.Cells(r, 7).Value = .CptDernier
                ws.Cells(r, 8).Value = .CptActuel
                If .UsageJour > 0 Then ws.Cells(r, 9).Value = Round(.UsageJour, 1)
                If .UsageEstime Then ws.Cells(r, 9).Font.Italic = True   ' italique = valeur estimée
                ws.Cells(r, 10).Value = .Cible
                ws.Cells(r, 11).Value = .Restant
            End If
            If Not IsEmpty(.DateTheo) Then ws.Cells(r, 12).Value = .DateTheo
            ws.Cells(r, 13).Value = .Retard
            ws.Cells(r, 14).Value = .Etat
            ColorerEtat ws.Cells(r, 14), .Etat
            If .Etat = "En retard" Or .Etat = "Retard critique" Then ColorerEtat ws.Cells(r, 12), .Etat
            If .TypeP = "Usage" And .Restant <= gAlerteH Then ColorerEtat ws.Cells(r, 11), .Etat
            For k = 1 To gNbDates
                d = DateEcheance(i, k)
                If Not IsEmpty(d) Then ws.Cells(r, 14 + k).Value = d
            Next k
        End With
    Next i
    ws.Range(ws.Cells(2, 6), ws.Cells(gNbEq + 1, 6)).NumberFormat = "dd/mm/yyyy"
    ws.Range(ws.Cells(2, 12), ws.Cells(gNbEq + 1, 12)).NumberFormat = "dd/mm/yyyy"
    ws.Range(ws.Cells(2, 15), ws.Cells(gNbEq + 1, nbCol)).NumberFormat = "dd/mm/yyyy"
    MiseEnForme ws, gNbEq + 1, nbCol
    Legende ws, gNbEq + 3
End Sub

Private Sub EcrirePlanning()
    Dim ws As Worksheet, i As Long, r As Long
    Set ws = Feuille("Planning")
    Vider ws
    Entete ws, 1, Array("ID intervention", "ID équipement", "Équipement", "N° échéance", "Date prévue", _
        "Semaine", "Déclenchement", "Durée (h)", "Technicien", "Criticité", "État", "Alerte", "Opérations (gamme)")
    For i = 1 To gNbInt
        r = i + 1
        With gInt(i)
            ws.Cells(r, 1).Value = "INT-" & Format(i, "000")
            ws.Cells(r, 2).Value = gEq(.IdxEq).ID
            ws.Cells(r, 3).Value = gEq(.IdxEq).Nom
            ws.Cells(r, 4).Value = .Numero
            ws.Cells(r, 5).Value = .DatePrevue
            ws.Cells(r, 6).Value = LibSemaine(.DatePrevue)
            ws.Cells(r, 7).Value = .Declenchement
            ws.Cells(r, 8).Value = gEq(.IdxEq).Duree
            ws.Cells(r, 9).Value = gEq(.IdxEq).Technicien
            ws.Cells(r, 10).Value = gEq(.IdxEq).Criticite
            ws.Cells(r, 11).Value = .Etat
            ws.Cells(r, 12).Value = .Alerte
            ws.Cells(r, 13).Value = OperationsGamme(gEq(.IdxEq).ID)
            ColorerEtat ws.Cells(r, 11), .Etat
            If InStr(1, .Alerte, "Conflit") > 0 Then
                ColorerEtat ws.Cells(r, 12), "CONFLIT"
            ElseIf .Alerte <> "" Then
                ColorerEtat ws.Cells(r, 12), "À surveiller"
            End If
        End With
    Next i
    If gNbInt > 0 Then ws.Range(ws.Cells(2, 5), ws.Cells(gNbInt + 1, 5)).NumberFormat = "dd/mm/yyyy"
    MiseEnForme ws, gNbInt + 1, 13
    ws.Columns(13).ColumnWidth = 60
    ws.Columns(12).ColumnWidth = 34
    ws.Columns(7).ColumnWidth = 30
End Sub

Private Sub EcrireCharge()
    Dim ws As Worksheet, s As Long, t As Long, r As Long, c As Long, tot As Double
    Dim titres() As String, nbCol As Long
    Set ws = Feuille("Dur")
    Vider ws
    nbCol = 8 + gNbTech
    ReDim titres(0 To nbCol - 1)
    titres(0) = "Semaine": titres(1) = "Début de semaine": titres(2) = "Fin de semaine"
    titres(3) = "Nb interventions"
    For t = 1 To gNbTech: titres(3 + t) = "Charge " & gTech(t) & " (h)": Next t
    titres(4 + gNbTech) = "Charge totale (h)"
    titres(5 + gNbTech) = "Capacité / technicien (h)"
    titres(6 + gNbTech) = "Résultat"
    titres(7 + gNbTech) = "Détail"
    Entete ws, 1, titres

    For s = 1 To gNbSem
        r = s + 1
        ws.Cells(r, 1).Value = LibSemaine(gLundi1 + 7 * (s - 1))
        ws.Cells(r, 2).Value = gLundi1 + 7 * (s - 1)
        ws.Cells(r, 3).Value = gLundi1 + 7 * (s - 1) + 6
        ws.Cells(r, 4).Value = gSemNb(s)
        tot = 0
        For t = 1 To gNbTech
            ws.Cells(r, 4 + t).Value = gSemCharge(s, t)
            tot = tot + gSemCharge(s, t)
            If gSemCharge(s, t) > gCapacite Then ColorerEtat ws.Cells(r, 4 + t), "CONFLIT"
        Next t
        ws.Cells(r, 5 + gNbTech).Value = tot
        ws.Cells(r, 6 + gNbTech).Value = gCapacite
        If gSemConflit(s) <> "" Then
            ws.Cells(r, 7 + gNbTech).Value = "CONFLIT"
            ws.Cells(r, 8 + gNbTech).Value = gSemConflit(s)
            ws.Range(ws.Cells(r, 1), ws.Cells(r, 4)).Interior.Color = RGB(255, 199, 206)
            ColorerEtat ws.Cells(r, 7 + gNbTech), "CONFLIT"
            If gSemNb(s) > gNbMax Then ColorerEtat ws.Cells(r, 4), "CONFLIT"
        Else
            ws.Cells(r, 7 + gNbTech).Value = "OK"
            ColorerEtat ws.Cells(r, 7 + gNbTech), "Planifiée"
        End If
    Next s
    ws.Range(ws.Cells(2, 2), ws.Cells(gNbSem + 1, 3)).NumberFormat = "dd/mm/yyyy"
    MiseEnForme ws, gNbSem + 1, nbCol
    ws.Columns(nbCol).ColumnWidth = 55
End Sub

Private Sub EcrireConflits()
    Dim ws As Worksheet, i As Long, r As Long
    Set ws = Feuille("Conf")
    Vider ws
    Entete ws, 1, Array("ID contrôle", "Date ou période", "Équipement(s)", "Technicien", _
                        "Type de contrôle", "Résultat", "Détail / proposition")
    For i = 1 To gNbAl
        r = i + 1
        With gAl(i)
            ws.Cells(r, 1).Value = "CF-" & Format(i, "000")
            ws.Cells(r, 2).Value = .Quand
            If VarType(.Quand) = vbDate Then ws.Cells(r, 2).NumberFormat = "dd/mm/yyyy"
            ws.Cells(r, 3).Value = .Equipements
            ws.Cells(r, 4).Value = .Technicien
            ws.Cells(r, 5).Value = .TypeControle
            ws.Cells(r, 6).Value = .Resultat
            ws.Cells(r, 7).Value = .Detail
            ColorerEtat ws.Cells(r, 6), .Resultat
        End With
    Next i
    If gNbAl = 0 Then ws.Cells(2, 1).Value = "Aucun conflit ni retard détecté."
    MiseEnForme ws, gNbAl + 1, 7
    ws.Columns(3).ColumnWidth = 40
    ws.Columns(7).ColumnWidth = 70
End Sub

' Diagramme de Gantt hebdomadaire : une ligne par équipement, une colonne par semaine
Private Sub EcrireGantt()
    Dim ws As Worksheet, i As Long, s As Long, r As Long, c As Long, t As Long
    Const COL1 As Long = 4
    Set ws = Feuille("Gan")
    Vider ws
    ws.Cells(1, 1).Value = "ID": ws.Cells(1, 2).Value = "Équipement": ws.Cells(1, 3).Value = "Technicien"
    For s = 1 To gNbSem
        ws.Cells(1, COL1 + s - 1).Value = "S" & Format(IsoSemaine(gLundi1 + 7 * (s - 1)), "00")
        ws.Cells(2, COL1 + s - 1).Value = Format(gLundi1 + 7 * (s - 1), "dd/mm")
    Next s
    ws.Cells(2, 2).Value = "(lundi de la semaine)"
    With ws.Range(ws.Cells(1, 1), ws.Cells(2, COL1 + gNbSem - 1))
        .Font.Bold = True: .Font.Color = vbWhite: .Interior.Color = RGB(31, 78, 121)
        .HorizontalAlignment = xlCenter
    End With
    ws.Range(ws.Cells(2, COL1), ws.Cells(2, COL1 + gNbSem - 1)).Font.Size = 7

    For i = 1 To gNbEq
        r = i + 2
        ws.Cells(r, 1).Value = gEq(i).ID
        ws.Cells(r, 2).Value = gEq(i).Nom
        ws.Cells(r, 3).Value = gEq(i).Technicien
    Next i
    ' une case colorée par intervention (le chiffre = n° d'échéance)
    For i = 1 To gNbInt
        r = gInt(i).IdxEq + 2
        c = COL1 + NumSemaine(gInt(i).DatePrevue) - 1
        ws.Cells(r, c).Value = gInt(i).Numero
        ColorerEtat ws.Cells(r, c), gInt(i).Etat
    Next i

    ' lignes de synthèse : nb d'interventions et charge par technicien
    r = gNbEq + 3
    ws.Cells(r, 2).Value = "Nb interventions (max " & gNbMax & ")"
    For t = 1 To gNbTech
        ws.Cells(r + t, 2).Value = "Charge " & gTech(t) & " (max " & gCapacite & " h)"
    Next t
    ws.Cells(r + gNbTech + 1, 2).Value = "Conflit de charge"
    For s = 1 To gNbSem
        c = COL1 + s - 1
        ws.Cells(r, c).Value = gSemNb(s)
        If gSemNb(s) > gNbMax Then ColorerEtat ws.Cells(r, c), "CONFLIT"
        For t = 1 To gNbTech
            If gSemCharge(s, t) > 0 Then ws.Cells(r + t, c).Value = gSemCharge(s, t)
            If gSemCharge(s, t) > gCapacite Then ColorerEtat ws.Cells(r + t, c), "CONFLIT"
        Next t
        If gSemConflit(s) <> "" Then
            ws.Cells(r + gNbTech + 1, c).Value = "!"
            ColorerEtat ws.Cells(r + gNbTech + 1, c), "CONFLIT"
        End If
    Next s
    ws.Range(ws.Cells(r, 2), ws.Cells(r + gNbTech + 1, 2)).Font.Bold = True

    Bordures ws.Range(ws.Cells(1, 1), ws.Cells(r + gNbTech + 1, COL1 + gNbSem - 1))
    ws.Range(ws.Cells(3, COL1), ws.Cells(r + gNbTech + 1, COL1 + gNbSem - 1)).HorizontalAlignment = xlCenter
    ws.Columns(1).ColumnWidth = 6
    ws.Columns(2).ColumnWidth = 34
    ws.Columns(3).ColumnWidth = 13
    For s = 1 To gNbSem: ws.Columns(COL1 + s - 1).ColumnWidth = 5: Next s
    Legende ws, r + gNbTech + 3
End Sub

'==========================================================================
'  SIGNALEMENT VISUEL
'==========================================================================
Private Sub ColorerEtat(ByVal c As Range, ByVal etat As String)
    Select Case etat
        Case "Planifiée", "OK"
            c.Interior.Color = RGB(198, 239, 206): c.Font.Color = RGB(0, 97, 0)
        Case "À surveiller", "À arbitrer"
            c.Interior.Color = RGB(255, 235, 156): c.Font.Color = RGB(156, 87, 0)
        Case "En retard"
            c.Interior.Color = RGB(255, 199, 206): c.Font.Color = RGB(156, 0, 6): c.Font.Bold = True
        Case "Retard critique", "CONFLIT"
            c.Interior.Color = RGB(192, 0, 0): c.Font.Color = RGB(255, 255, 255): c.Font.Bold = True
        Case "À définir"
            c.Interior.Color = RGB(217, 217, 217): c.Font.Color = RGB(64, 64, 64)
    End Select
End Sub

Private Sub Legende(ByVal ws As Worksheet, ByVal r As Long)
    ws.Cells(r, 2).Value = "Légende"
    ws.Cells(r, 2).Font.Bold = True
    ws.Cells(r + 1, 2).Value = "Planifiée": ColorerEtat ws.Cells(r + 1, 2), "Planifiée"
    ws.Cells(r + 2, 2).Value = "À surveiller (compteur proche / à arbitrer)": ColorerEtat ws.Cells(r + 2, 2), "À surveiller"
    ws.Cells(r + 3, 2).Value = "En retard (date ou compteur dépassé)": ColorerEtat ws.Cells(r + 3, 2), "En retard"
    ws.Cells(r + 4, 2).Value = "Retard critique / CONFLIT de charge": ColorerEtat ws.Cells(r + 4, 2), "CONFLIT"
    ws.Cells(r + 5, 2).Value = "À définir (donnée manquante)": ColorerEtat ws.Cells(r + 5, 2), "À définir"
End Sub

' Efface la feuille (valeurs + couleurs) et remet des hauteurs de ligne normales
Private Sub Vider(ByVal ws As Worksheet)
    RetirerTableaux ws
    ws.Cells.Clear
    On Error Resume Next
    ws.Rows.RowHeight = 15
End Sub

' Les anciens tableaux Excel (ListObjects) de la feuille sont convertis
' en plages normales, pour que la macro puisse réécrire la feuille librement
Private Sub RetirerTableaux(ByVal ws As Worksheet)
    Dim n As Long
    On Error GoTo Fin
    n = ws.ListObjects.Count
    Do While n > 0
        ws.ListObjects(n).Unlist
        n = n - 1
    Loop
Fin:
End Sub

Private Sub Entete(ByVal ws As Worksheet, ByVal ligne As Long, ByVal titres As Variant)
    Dim j As Long, n As Long
    n = UBound(titres) - LBound(titres) + 1
    For j = 1 To n
        ws.Cells(ligne, j).Value = titres(LBound(titres) + j - 1)
    Next j
    With ws.Range(ws.Cells(ligne, 1), ws.Cells(ligne, n))
        .Font.Bold = True
        .Font.Color = RGB(255, 255, 255)
        .Interior.Color = RGB(31, 78, 121)
        .WrapText = True
        .VerticalAlignment = xlCenter
        .HorizontalAlignment = xlCenter
    End With
    ws.Rows(ligne).RowHeight = 32
End Sub

Private Sub Bordures(ByVal rng As Range)
    On Error Resume Next
    rng.Borders.LineStyle = xlContinuous
    rng.Borders.Color = RGB(191, 191, 191)
End Sub

Private Sub MiseEnForme(ByVal ws As Worksheet, ByVal derLigne As Long, ByVal nbCol As Long)
    On Error Resume Next
    Bordures ws.Range(ws.Cells(1, 1), ws.Cells(derLigne, nbCol))
    ws.Range(ws.Cells(1, 1), ws.Cells(derLigne, nbCol)).Columns.AutoFit
    Dim j As Long
    For j = 1 To nbCol
        If ws.Columns(j).ColumnWidth < 11 Then ws.Columns(j).ColumnWidth = 11
        If ws.Columns(j).ColumnWidth > 45 Then ws.Columns(j).ColumnWidth = 45
    Next j
    ws.Rows(1).RowHeight = 32
End Sub

' Ajoute (une seule fois) un bouton "Générer" sur la feuille Equipement
Private Sub CreerBouton()
    On Error Resume Next
    Dim ws As Worksheet, b As Object
    Set ws = Feuille("Equip")
    For Each b In ws.Buttons
        If InStr(1, b.OnAction, "GenererPlanMaintenance") > 0 Then Exit Sub
    Next b
    Set b = ws.Buttons.Add(ws.Range("O2").Left, ws.Range("O2").Top, 210, 34)
    b.OnAction = "GenererPlanMaintenance"
    b.Caption = "Générer le plan de maintenance"
End Sub

'==========================================================================
'  TESTS (Séance 5 - consigne 4 / Séance 6 - consignes 3 et 5)
'==========================================================================
Public Sub TesterMoteur()
    Dim ws As Worksheet, r As Long, ref As Date, eq As Variant, k As Long, s As String
    Dim nbT As Long, nbU As Long, i As Long, silence As Boolean
    silence = gSilencieux
    Set ws = Feuille("Tests")
    Vider ws
    Entete ws, 1, Array("N°", "Séance", "Cas testé", "Attendu", "Obtenu", "Résultat")
    r = 2
    ref = DateSerial(2026, 10, 16)

    ' --- Séance 5 : 4 équipements du parc, 4 prochaines échéances ---
    s = ListeDates(DateSerial(2026, 9, 5), 3, "Mois")
    Verifier ws, r, "5", "EQ01 Sérigraphie : dernière 05/09/2026, tous les 3 mois", _
        "05/12/2026 ; 05/03/2027 ; 05/06/2027 ; 05/09/2027", s
    s = ListeDates(DateSerial(2026, 7, 10), 6, "Mois")
    Verifier ws, r, "5", "EQ03 Four de refusion : dernière 10/07/2026, tous les 6 mois", _
        "10/01/2027 ; 10/07/2027 ; 10/01/2028 ; 10/07/2028", s
    s = ListeDates(DateSerial(2026, 9, 30), 1, "Mois")
    Verifier ws, r, "5", "EQ05 Convoyeur : dernière 30/09/2026, tous les mois", _
        "30/10/2026 ; 30/11/2026 ; 30/12/2026 ; 30/01/2027", s
    s = ListeDates(DateSerial(2026, 9, 25), 1, "Mois")
    Verifier ws, r, "5", "EQ08 Compresseur : dernière 25/09/2026, tous les mois", _
        "25/10/2026 ; 25/11/2026 ; 25/12/2026 ; 25/01/2027", s

    ' --- Séance 5 : cas particuliers du calendrier ---
    Verifier ws, r, "5", "Fin de mois : 31/01/2026 + 1 mois", "28/02/2026", _
        Format(ProchaineDate(DateSerial(2026, 1, 31), 1, "Mois", 1), "dd/mm/yyyy")
    Verifier ws, r, "5", "Pas de dérive : 31/01/2026, 2e échéance mensuelle", "31/03/2026", _
        Format(ProchaineDate(DateSerial(2026, 1, 31), 1, "Mois", 2), "dd/mm/yyyy")
    Verifier ws, r, "5", "Unité Semaine : 01/10/2026 + 2 semaines", "15/10/2026", _
        Format(ProchaineDate(DateSerial(2026, 10, 1), 2, "Semaine", 1), "dd/mm/yyyy")
    Verifier ws, r, "5", "Échéance tombant le jour même (16/07 + 3 mois, réf. 16/10)", "Planifiée", _
        EtatTemporel(DateSerial(2026, 7, 16), 3, "Mois", ref, 0)

    ' --- Séance 6 : usage et cas limites ---
    Verifier ws, r, "6", "Usage EQ02 : 4200 h, cible 4300 h, alerte 100 h", "À surveiller", EtatUsage(4200, 4300, 500, 100)
    Verifier ws, r, "6", "Usage : 4000 h, cible 4300 h", "Planifiée", EtatUsage(4000, 4300, 500, 100)
    Verifier ws, r, "6", "Usage : 4350 h, cible 4300 h (dépassé)", "En retard", EtatUsage(4350, 4300, 500, 100)
    Verifier ws, r, "6", "Usage : 4900 h, cible 4300 h (dépasse largement)", "Retard critique", EtatUsage(4900, 4300, 500, 100)
    Verifier ws, r, "6", "Usage moyen EQ02 : 400 h en 31 jours", "12,9", _
        Replace(Format(UsageMoyen(4200, 3800, DateSerial(2026, 9, 15), ref), "0.0"), ".", ",")
    Verifier ws, r, "6", "Date estimée EQ02 : 100 h restantes à 12,9 h/j", "24/10/2026", _
        Format(DateUsageEstimee(4200, 4300, 400 / 31, ref), "dd/mm/yyyy")
    Verifier ws, r, "6", "Temporel en retard : 01/06/2026 + 3 mois, réf. 16/10/2026", "En retard", _
        EtatTemporel(DateSerial(2026, 6, 1), 3, "Mois", ref, 0)
    Verifier ws, r, "6", "Retard critique : 01/01/2026 + 3 mois (2 échéances manquées)", "Retard critique", _
        EtatTemporel(DateSerial(2026, 1, 1), 3, "Mois", ref, 0)
    Verifier ws, r, "6", "Semaine ISO du 19/10/2026", "43", CStr(IsoSemaine(DateSerial(2026, 10, 19)))
    Verifier ws, r, "6", "Semaine ISO du 01/01/2027 (appartient à 2026)", "53", CStr(IsoSemaine(DateSerial(2027, 1, 1)))
    Verifier ws, r, "6", "Jour ouvré suivant le vendredi 04/12/2026", "07/12/2026", _
        Format(JourOuvreSuivant(DateSerial(2026, 12, 4)), "dd/mm/yyyy")

    ' --- Séance 6 : test sur tout le parc ---
    gSilencieux = True
    GenererPlanMaintenance
    gSilencieux = silence
    For i = 1 To gNbEq
        If gEq(i).TypeP = "Temporelle" Then nbT = nbT + 1
        If gEq(i).TypeP = "Usage" Then nbU = nbU + 1
    Next i
    r = r + 1
    ws.Cells(r, 3).Value = "Test sur tout le parc (au " & Format(gDateRef, "dd/mm/yyyy") & ")"
    ws.Cells(r, 3).Font.Bold = True
    r = r + 1
    Info ws, r, "Équipements traités", gNbEq & " (" & nbT & " temporels, " & nbU & " à l'usage)"
    Info ws, r, "Interventions générées sur " & gHorizon & " mois", CStr(gNbInt)
    Info ws, r, "Équipements en retard", CStr(CompterEtat("En retard") + CompterEtat("Retard critique"))
    Info ws, r, "Équipements à surveiller (compteur proche)", CStr(CompterEtat("À surveiller"))
    Info ws, r, "Semaines en conflit de charge", CStr(CompterSemainesConflit())
    Info ws, r, "Cas de dates identiques détectés", CStr(CompterAlertes("Même date"))
    MiseEnForme ws, r - 1, 6
    ws.Columns(3).ColumnWidth = 60
    ws.Columns(4).ColumnWidth = 50
    ws.Columns(5).ColumnWidth = 50
    If Not gSilencieux Then MsgBox "Tests terminés : voir la feuille Tests.", vbInformation
End Sub

' Exécution sans fenêtre de message (utile pour un lancement automatique)
Public Sub GenererEtTesterSansMessage()
    gSilencieux = True
    TesterMoteur
    gSilencieux = False
End Sub

Private Function ListeDates(ByVal d As Date, ByVal p As Double, ByVal u As String) As String
    Dim k As Long, s As String
    For k = 1 To 4
        If k > 1 Then s = s & " ; "
        s = s & Format(ProchaineDate(d, p, u, k), "dd/mm/yyyy")
    Next k
    ListeDates = s
End Function

Private Sub Verifier(ByVal ws As Worksheet, ByRef r As Long, ByVal seance As String, ByVal cas As String, _
                     ByVal attendu As String, ByVal obtenu As String)
    ws.Cells(r, 1).Value = r - 1
    ws.Cells(r, 2).Value = "Séance " & seance
    ws.Cells(r, 3).Value = cas
    ws.Cells(r, 4).NumberFormat = "@": ws.Cells(r, 4).Value = attendu
    ws.Cells(r, 5).NumberFormat = "@": ws.Cells(r, 5).Value = obtenu
    If attendu = obtenu Then
        ws.Cells(r, 6).Value = "OK": ColorerEtat ws.Cells(r, 6), "OK"
    Else
        ws.Cells(r, 6).Value = "ÉCHEC": ColorerEtat ws.Cells(r, 6), "CONFLIT"
    End If
    r = r + 1
End Sub

Private Sub Info(ByVal ws As Worksheet, ByRef r As Long, ByVal libelle As String, ByVal valeur As String)
    ws.Cells(r, 2).Value = "Séance 6"
    ws.Cells(r, 3).Value = libelle
    ws.Cells(r, 5).NumberFormat = "@"
    ws.Cells(r, 5).Value = valeur
    r = r + 1
End Sub

'==========================================================================
'  OUTILS
'==========================================================================
' Retrouve une feuille par le début de son nom (évite les soucis d'accents :
' l'ancienne macro cherchait "Duree" et "Conflit" alors que les feuilles
' s'appellent "Durée" et "Conflits" -> erreur 9)
Private Function Feuille(ByVal debutNom As String) As Worksheet
    Dim ws As Worksheet
    For Each ws In ThisWorkbook.Worksheets
        If LCase(Left(ws.Name, Len(debutNom))) = LCase(debutNom) Then
            Set Feuille = ws
            Exit Function
        End If
    Next ws
    Err.Raise vbObjectError + 1, , "Feuille introuvable : " & debutNom
End Function

' Lit un paramètre dans la feuille paramétre (colonne A contient "cle")
Private Function Param(ByVal cle As String, ByVal defaut As Variant) As Variant
    Dim ws As Worksheet, r As Long, v As Variant
    Param = defaut
    Set ws = Feuille("param")
    For r = 2 To ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
        If InStr(1, LCase(CStr(ws.Cells(r, 1).Value)), LCase(cle)) > 0 Then
            v = ws.Cells(r, 2).Value
            If IsEmpty(v) Then
                Param = defaut
            ElseIf VarType(v) = vbDate Then
                Param = v
            ElseIf IsNumeric(v) Then
                Param = CDbl(v)
            ElseIf IsNumeric(Left(Trim(CStr(v)), 1)) Then
                Param = Val(Replace(CStr(v), ",", "."))    ' accepte "8 h", "12 mois"
            End If
            Exit Function
        End If
    Next r
End Function

' Convertit une cellule en nombre (accepte "1.5", "1,5", vide -> 0)
Private Function Nombre(ByVal v As Variant) As Double
    If IsEmpty(v) Then
        Nombre = 0
    ElseIf VarType(v) = vbString Then
        Nombre = Val(Replace(Replace(Trim(v), " ", ""), ",", "."))
    ElseIf IsNumeric(v) Then
        Nombre = CDbl(v)
    Else
        Nombre = 0
    End If
End Function

Private Function NormaliserType(ByVal v As Variant) As String
    Dim t As String
    t = LCase(Trim(CStr(v)))
    If Left(t, 4) = "temp" Then
        NormaliserType = "Temporelle"
    ElseIf Left(t, 3) = "usa" Then
        NormaliserType = "Usage"
    Else
        NormaliserType = ""
    End If
End Function

' m = mois, s = semaine, j = jour, a = an
Private Function CodeUnite(ByVal unite As String) As String
    Dim u As String
    u = LCase(Left(Trim(unite), 1))
    Select Case u
        Case "m": CodeUnite = "m"
        Case "s", "w": CodeUnite = "s"
        Case "j", "d": CodeUnite = "j"
        Case "a", "y": CodeUnite = "a"
        Case Else: CodeUnite = ""
    End Select
End Function

Private Function RangCriticite(ByVal c As String) As Long
    Select Case LCase(Trim(c))
        Case "critique": RangCriticite = 4
        Case "haute": RangCriticite = 3
        Case "moyenne": RangCriticite = 2
        Case "basse", "faible": RangCriticite = 1
        Case Else: RangCriticite = 0
    End Select
End Function

Private Function Lundi(ByVal d As Date) As Date
    Lundi = Int(d) - Weekday(d, vbMonday) + 1
End Function

' Numéro de semaine ISO 8601 (la semaine 1 contient le premier jeudi de l'année)
Public Function IsoSemaine(ByVal d As Date) As Long
    Dim jeudi As Date
    jeudi = Lundi(d) + 3
    IsoSemaine = (jeudi - DateSerial(Year(jeudi), 1, 1)) \ 7 + 1
End Function

Private Function LibSemaine(ByVal d As Date) As String
    LibSemaine = Year(Lundi(d) + 3) & "-S" & Format(IsoSemaine(d), "00")
End Function

' Indice de la semaine dans l'horizon (1 = semaine de la date de référence)
Private Function NumSemaine(ByVal d As Date) As Long
    NumSemaine = (Lundi(d) - gLundi1) \ 7 + 1
    If NumSemaine < 1 Then NumSemaine = 1
    If NumSemaine > gNbSem Then NumSemaine = gNbSem
End Function

Public Function JourOuvreSuivant(ByVal d As Date) As Date
    d = d + 1
    Do While Weekday(d, vbMonday) > 5
        d = d + 1
    Loop
    JourOuvreSuivant = d
End Function

Private Sub AjouterTechnicien(ByVal nom As String)
    Dim t As Long, j As Long
    For t = 1 To gNbTech
        If gTech(t) = nom Then Exit Sub
    Next t
    If gNbTech = 0 Then
        ReDim gTech(1 To 1)
    Else
        ReDim Preserve gTech(1 To gNbTech + 1)
    End If
    ' insertion triée
    j = gNbTech
    Do While j >= 1
        If gTech(j) <= nom Then Exit Do
        gTech(j + 1) = gTech(j)
        j = j - 1
    Loop
    gTech(j + 1) = nom
    gNbTech = gNbTech + 1
End Sub

Private Function IndexTech(ByVal nom As String) As Long
    Dim t As Long
    For t = 1 To gNbTech
        If gTech(t) = nom Then IndexTech = t: Exit Function
    Next t
    IndexTech = 1
End Function

Private Sub AjouterAlerte(ByVal quand As Variant, ByVal eqs As String, ByVal tech As String, _
                          ByVal typ As String, ByVal res As String, ByVal det As String)
    gNbAl = gNbAl + 1
    ReDim Preserve gAl(1 To gNbAl)
    With gAl(gNbAl)
        .Quand = quand: .Equipements = eqs: .Technicien = tech
        .TypeControle = typ: .Resultat = res: .Detail = det
    End With
End Sub

Private Sub AjouterTexte(ByRef cible As String, ByVal txt As String)
    If cible = "" Then cible = txt Else cible = cible & " ; " & txt
End Sub

Private Function ListeEqSemaine(ByVal s As Long, ByVal tech As String) As String
    Dim i As Long, txt As String
    For i = 1 To gNbInt
        If NumSemaine(gInt(i).DatePrevue) = s Then
            If tech = "" Or gEq(gInt(i).IdxEq).Technicien = tech Then
                If txt <> "" Then txt = txt & ", "
                txt = txt & gEq(gInt(i).IdxEq).ID
            End If
        End If
    Next i
    ListeEqSemaine = txt
End Function

Private Function OperationsGamme(ByVal idEq As String) As String
    Dim ws As Worksheet, r As Long
    On Error GoTo Fin
    Set ws = Feuille("Gam")
    For r = 2 To ws.Cells(ws.Rows.Count, 2).End(xlUp).Row
        If Trim(CStr(ws.Cells(r, 2).Value)) = idEq Then
            OperationsGamme = ws.Cells(r, 1).Value & " : " & ws.Cells(r, 3).Value
            Exit Function
        End If
    Next r
Fin:
End Function

Private Function CompterEtat(ByVal etat As String) As Long
    Dim i As Long
    For i = 1 To gNbEq
        If gEq(i).Etat = etat Then CompterEtat = CompterEtat + 1
    Next i
End Function

Private Function CompterSemainesConflit() As Long
    Dim s As Long
    For s = 1 To gNbSem
        If gSemConflit(s) <> "" Then CompterSemainesConflit = CompterSemainesConflit + 1
    Next s
End Function

Private Function CompterAlertes(ByVal debutType As String) As Long
    Dim i As Long
    For i = 1 To gNbAl
        If Left(gAl(i).TypeControle, Len(debutType)) = debutType Then CompterAlertes = CompterAlertes + 1
    Next i
End Function
