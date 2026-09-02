package tech.mehdiacho.atesters.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Same palette as the web app: neutral chrome, colour reserved for state. */
private val Brand = Color(0xFF1FC47C)
private val Warn = Color(0xFFFBBF5C)
private val Danger = Color(0xFFF87171)
private val Ink = Color(0xFF0B0F0E)
private val Surface = Color(0xFF111715)
private val SurfaceRaised = Color(0xFF18201D)
private val BorderDark = Color(0xFF243029)
private val TextDark = Color(0xFFE8EFEA)
private val MutedDark = Color(0xFF8A9A91)

private val DarkColors = darkColorScheme(
    primary = Brand,
    onPrimary = Ink,
    secondary = Warn,
    onSecondary = Ink,
    error = Danger,
    background = Ink,
    onBackground = TextDark,
    surface = Surface,
    onSurface = TextDark,
    surfaceVariant = SurfaceRaised,
    onSurfaceVariant = MutedDark,
    outline = BorderDark,
)

private val LightColors = lightColorScheme(
    primary = Color(0xFF0E9463),
    onPrimary = Color.White,
    secondary = Color(0xFFB45309),
    error = Color(0xFFB91C1C),
    background = Color(0xFFF7F9F8),
    onBackground = Color(0xFF11201A),
    surface = Color.White,
    onSurface = Color(0xFF11201A),
    surfaceVariant = Color(0xFFEDF2EF),
    onSurfaceVariant = Color(0xFF5A6B63),
    outline = Color(0xFFD6E0DA),
)

private val AppTypography = Typography(
    headlineSmall = TextStyle(fontSize = 24.sp, fontWeight = FontWeight.SemiBold),
    titleMedium = TextStyle(fontSize = 16.sp, fontWeight = FontWeight.Medium),
    bodyMedium = TextStyle(fontSize = 14.sp),
    bodySmall = TextStyle(fontSize = 12.sp),
    labelSmall = TextStyle(fontSize = 11.sp, fontWeight = FontWeight.Medium),
)

@Composable
fun ATestersTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColors else LightColors,
        typography = AppTypography,
        content = content,
    )
}
